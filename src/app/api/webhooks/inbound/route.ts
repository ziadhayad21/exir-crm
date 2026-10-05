// src/app/api/webhooks/inbound/route.ts
// Inbound Webhook API Route for Facebook Messenger & Unified Messaging.
// Implements GET Meta verification challenge, POST HMAC-SHA256 signature validation,
// raw-first persistence, atomic DB ingestion, and 100% concurrency safety against duplicate/lost leads.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import {
  verifyMetaSignature,
  normalizeInboundPayload,
  fetchFacebookProfileName,
} from '@/lib/messaging/meta-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET Handler — Meta Webhook Subscription Verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const expectedToken = process.env.META_VERIFY_TOKEN?.trim();

  // Temporary safe debug logging.
  // Never logs the actual token value.
  console.log('[Inbound Webhook GET] Verification check:', {
    mode,
    hasReceivedToken: !!token,
    hasExpectedToken: !!expectedToken,
    tokenMatches:
      !!token && !!expectedToken && token === expectedToken,
    hasChallenge: !!challenge,
  });

  if (
    mode === 'subscribe' &&
    token &&
    expectedToken &&
    token === expectedToken
  ) {
    console.log('[Inbound Webhook GET] Meta verification successful');

    return new NextResponse(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[Inbound Webhook GET] Meta verification failed: Token mismatch or invalid mode');

  return NextResponse.json(
    { error: 'Forbidden: Invalid verification token' },
    { status: 403 }
  );
}

/**
 * POST Handler — Secure Inbound Event Ingestion & Invariant Protection
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const rawArrayBuffer = await req.arrayBuffer();
  const rawBuffer = Buffer.from(rawArrayBuffer);
  const rawBody = rawBuffer.toString('utf-8');
  const headers = Object.fromEntries(req.headers.entries());

  // 1. Signature & Authorization Verification
  const signatureHeader =
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-hub-signature');
  const authHeader = req.headers.get('authorization');
  const webhookSecretHeader = req.headers.get('x-webhook-secret');
  const appSecret = process.env.META_APP_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  console.log('[Inbound Webhook] Secret diagnostics:', {
    hasAppSecret: !!process.env.META_APP_SECRET,
    appSecretLength: process.env.META_APP_SECRET?.trim().length ?? 0,
  });

  console.log('[Inbound Webhook POST] Inbound request received:', {
    bodyLength: rawBuffer.length,
    hasSig256: !!req.headers.get('x-hub-signature-256'),
    hasSigSha1: !!req.headers.get('x-hub-signature'),
    hasAppSecret: !!appSecret,
    hasAuthHeader: !!authHeader,
    hasWebhookSecretHeader: !!webhookSecretHeader,
  });

  let isAuthorized = false;
  let signatureVerified = false;

  if (signatureHeader && appSecret) {
    signatureVerified = verifyMetaSignature(
      rawBuffer,
      signatureHeader,
      appSecret
    );
    isAuthorized = signatureVerified;
  } else if (
    authHeader &&
    serviceKey &&
    (authHeader === `Bearer ${serviceKey}` || authHeader === serviceKey)
  ) {
    isAuthorized = true; // Internal service key authorization (test scripts)
  } else if (
    webhookSecretHeader &&
    process.env.WEBHOOK_SECRET &&
    webhookSecretHeader === process.env.WEBHOOK_SECRET.trim()
  ) {
    isAuthorized = true; // Webhook secret header authorization
  } else {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) isAuthorized = true;
    } catch {
      isAuthorized = false;
    }
  }

  if (!isAuthorized) {
    console.warn('[Inbound Webhook POST] Authorization failed diagnostics:', {
      hasSig256: !!req.headers.get('x-hub-signature-256'),
      hasSigSha1: !!req.headers.get('x-hub-signature'),
      hasAppSecret: !!process.env.META_APP_SECRET,
      appSecretLength: process.env.META_APP_SECRET?.trim().length ?? 0,
      bodyLength: rawBuffer.length,
      signatureVerified,
    });

    return NextResponse.json(
      { error: 'Unauthorized: Invalid signature or access token' },
      { status: 401 }
    );
  }

  let rawPayload: Record<string, unknown>;

  try {
    rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (err: unknown) {
    const errorObj = err as Error;
    console.error('[Inbound Webhook POST] Malformed JSON payload received:', {
      errorName: errorObj?.name || 'SyntaxError',
      errorMessage: errorObj?.message || String(err),
    });
    return NextResponse.json(
      { error: 'Bad Request: Malformed JSON body' },
      { status: 400 }
    );
  }

  // 2. Normalize Payload (Meta Messenger v26.0 vs Mock/Generic)
  const normalizedEvents = normalizeInboundPayload(rawPayload);

  console.log('[Inbound Webhook POST] Normalized events count:', normalizedEvents.length);

  if (!normalizedEvents || normalizedEvents.length === 0) {
    console.warn('[Inbound Webhook POST] Webhook payload ignored: No supported messaging events found');
    return NextResponse.json({
      success: true,
      status: 'ignored',
      reason: 'no_supported_events',
    });
  }

  console.log('[Inbound Webhook POST] Starting event processing:', {
    eventsCount: normalizedEvents.length,
  });

  const results = [];

  for (const event of normalizedEvents) {
    // If Messenger sender name is missing, attempt to fetch Facebook Profile Name via Meta Graph API
    if (event.channel === 'messenger' && !event.senderDisplayName && event.externalSenderId) {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const apiVersion = process.env.META_API_VERSION?.trim() || 'v21.0';
      if (pageToken) {
        const fetchedName = await fetchFacebookProfileName(
          event.externalSenderId,
          pageToken,
          apiVersion
        );
        event.senderDisplayName = fetchedName || 'Facebook User';
      } else {
        event.senderDisplayName = 'Facebook User';
      }
    }

    // 3. Raw-First Persistence in app.webhook_events
    console.log('[Inbound Webhook POST] Before webhook_events insert:', {
      channel: event.channel,
      eventId: event.eventId,
    });

    let rawEventId: string | null = null;

    const { data: existingEvent } = await admin
      .from('webhook_events')
      .select('id, status, retry_count')
      .eq('channel', event.channel)
      .eq('event_id', event.eventId)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === 'processed') {
        console.log('[Inbound Webhook POST] Duplicate event skipped:', {
          eventId: event.eventId,
          status: existingEvent.status,
        });
        results.push({
          event_id: event.eventId,
          status: 'ignored',
          reason: 'duplicate_event',
        });
        continue;
      }

      rawEventId = existingEvent.id;

      await admin
        .from('webhook_events')
        .update({
          status: 'processing',
          error_message: null,
          retry_count: (existingEvent.retry_count || 0) + 1,
        })
        .eq('id', existingEvent.id);
    } else {
      const { data: newEvt, error: evtErr } = await admin
        .from('webhook_events')
        .insert({
          channel: event.channel,
          event_id: event.eventId,
          payload: rawPayload,
          headers,
          status: 'processing',
        })
        .select('id')
        .single();

      if (evtErr || !newEvt) {
        console.error('[Inbound Webhook POST] Failed to record raw event in DB:', {
          errorName: evtErr?.code || 'PostgrestError',
          errorMessage: evtErr?.message || 'Failed to record raw webhook event',
        });

        return NextResponse.json(
          { error: 'Failed to record raw webhook event' },
          { status: 500 }
        );
      }

      rawEventId = newEvt.id;
    }

    console.log('[Inbound Webhook POST] After webhook_events insert:', {
      rawEventId,
      eventId: event.eventId,
    });

    // 4. Atomic Database Ingestion via PL/pgSQL RPC
    console.log('[Inbound Webhook POST] Before inbound message processing:', {
      rawEventId,
      channel: event.channel,
      externalSenderId: event.externalSenderId,
      externalThreadId: event.externalThreadId,
      hasExternalMessageId: !!event.externalMessageId,
    });

    try {
      const { data: ingestResult, error: ingestErr } = await admin.rpc(
        'ingest_inbound_message',
        {
          p_raw_event_id: rawEventId,
          p_channel: event.channel,
          p_external_sender_id: event.externalSenderId,
          p_sender_display_name: event.senderDisplayName || null,
          p_sender_phone: event.senderPhone || null,
          p_external_thread_id: event.externalThreadId,
          p_external_message_id: event.externalMessageId || null,
          p_message_type: event.messageType,
          p_content: event.content,
          p_media_url: event.mediaUrl || null,
          p_business_tz: 'Africa/Cairo',
        }
      );

      if (ingestErr) {
        throw new Error(ingestErr.message);
      }

      console.log('[Inbound Webhook POST] After inbound message processing:', {
        rawEventId,
        status: ingestResult?.status,
        conversationId: ingestResult?.conversation_id,
        messageId: ingestResult?.message_id,
        leadId: ingestResult?.lead_id,
        assignedTo: ingestResult?.assigned_to,
      });

      // Write Audit Logs cleanly
      if (
        ingestResult?.message_id &&
        !ingestResult.is_duplicate_message
      ) {
        await writeAuditLog({
          actor_id: null,
          action: 'inbox.message_received',
          module: 'crm',
          entity_type: 'message',
          entity_id: ingestResult.message_id,
          new_value: {
            channel: event.channel,
            conversation_id: ingestResult.conversation_id,
            direction: 'inbound',
            message_type: event.messageType,
            lead_id: ingestResult.lead_id,
          },
        });
      }

      if (ingestResult?.assigned_to) {
        await writeAuditLog({
          actor_id: null,
          action: 'inbox.conversation_assigned',
          module: 'crm',
          entity_type: 'conversation',
          entity_id: ingestResult.conversation_id,
          old_value: { assigned_to: null },
          new_value: {
            lead_id: ingestResult.lead_id,
            conversation_id: ingestResult.conversation_id,
            previous_owner: null,
            new_owner: ingestResult.assigned_to,
            timestamp: new Date().toISOString(),
            source: 'automatic_inbound',
          },
        });
      }

      results.push({
        event_id: event.eventId,
        conversation_id: ingestResult.conversation_id,
        message_id: ingestResult.message_id,
        lead_id: ingestResult.lead_id,
        assigned_to: ingestResult.assigned_to,
        status: ingestResult.status,
      });
    } catch (err: unknown) {
      const errorObj = err as Error;

      console.error('[Inbound Webhook POST] Processing error caught:', {
        eventId: event.eventId,
        errorName: errorObj?.name || 'Error',
        errorMessage: errorObj?.message || String(err),
      });

      if (rawEventId) {
        const { data: currEvt } = await admin
          .from('webhook_events')
          .select('retry_count')
          .eq('id', rawEventId)
          .maybeSingle();

        await admin
          .from('webhook_events')
          .update({
            status: 'failed',
            error_message: errorObj?.message || String(err),
            retry_count: (currEvt?.retry_count || 0) + 1,
          })
          .eq('id', rawEventId);
      }

      return NextResponse.json(
        { error: errorObj?.message || String(err) },
        { status: 500 }
      );
    }
  }

  const primaryResult = results[0] || {};

  console.log('[Inbound Webhook POST] Returning 200:', {
    resultsCount: results.length,
    primaryConversationId: primaryResult?.conversation_id,
    primaryStatus: primaryResult?.status,
  });

  return NextResponse.json({
    success: true,
    processed_count: results.length,
    conversation_id: primaryResult.conversation_id,
    message_id: primaryResult.message_id,
    lead_id: primaryResult.lead_id,
    assigned_to: primaryResult.assigned_to,
    status: primaryResult.status,
    results,
  });
}