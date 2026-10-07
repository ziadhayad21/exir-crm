// src/app/api/webhooks/inbound/route.ts
// Inbound Webhook API Route for Facebook Messenger, Instagram & WhatsApp Cloud API.
// Features sub-300ms fast HTTP 200 ACK with next/server after() for background ingestion,
// constant-time HMAC-SHA256 signature verification, raw-first persistence, and concurrency safety.

import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import {
  verifyMetaSignature,
  normalizeInboundPayload,
  fetchFacebookProfile,
  fetchInstagramProfile,
  type NormalizedInboundEvent,
} from '@/lib/messaging/meta-adapter';
import { processInboundMedia } from '@/lib/messaging/media-manager';
import type { MessageAttachmentType } from '@/types';
import { isGenericDisplayName } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET Handler — Meta Webhook Subscription Verification (Messenger, Instagram, WhatsApp)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const expectedMetaToken = process.env.META_VERIFY_TOKEN?.trim();
  const expectedIgToken = process.env.INSTAGRAM_VERIFY_TOKEN?.trim();
  const expectedWaToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  const tokenMatches =
    !!token &&
    ((expectedMetaToken && token === expectedMetaToken) ||
     (expectedIgToken && token === expectedIgToken) ||
     (expectedWaToken && token === expectedWaToken));

  if (mode === 'subscribe' && tokenMatches) {
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
 * Background worker executing post-ACK via Next.js after()
 */
async function processInboundEventBackground(
  rawEventId: string,
  event: NormalizedInboundEvent,
  admin: ReturnType<typeof createAdminClient>
) {
  try {
    // 1. Mark event as processing
    console.log(`[Inbound Webhook after()] Processing event ${event.eventId} (channel: ${event.channel})...`);
    await admin
      .from('webhook_events')
      .update({ status: 'processing' })
      .eq('id', rawEventId);

    // 2. Fetch social profile for Messenger & Instagram if display name is missing or generic
    let fetchedAvatarUrl: string | null = null;
    if (!event.senderDisplayName || isGenericDisplayName(event.senderDisplayName)) {
      if (event.channel === 'messenger' && event.externalSenderId) {
        const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
        if (pageToken) {
          try {
            const profile = await fetchFacebookProfile(event.externalSenderId, pageToken);
            if (profile?.name && !isGenericDisplayName(profile.name)) {
              event.senderDisplayName = profile.name;
              fetchedAvatarUrl = profile.avatar_url;
            }
          } catch {
            // Non-critical network error
          }
        }
      } else if (event.channel === 'instagram' && event.externalSenderId) {
        const igToken =
          process.env.INSTAGRAM_ACCESS_TOKEN?.trim() ||
          process.env.META_PAGE_ACCESS_TOKEN?.trim();
        if (igToken) {
          try {
            const profile = await fetchInstagramProfile(event.externalSenderId, igToken);
            if (profile?.name && !isGenericDisplayName(profile.name)) {
              event.senderDisplayName = profile.name;
              fetchedAvatarUrl = profile.avatar_url;
            }
          } catch {
            // Non-critical network error
          }
        }
      }
    }

    // Fallback display names
    if (!event.senderDisplayName) {
      if (event.channel === 'whatsapp') {
        event.senderDisplayName = event.senderPhone || 'WhatsApp User';
      } else if (event.channel === 'messenger') {
        event.senderDisplayName = 'Facebook User';
      } else if (event.channel === 'instagram') {
        event.senderDisplayName = 'Instagram User';
      } else {
        event.senderDisplayName = 'Contact';
      }
    }

    // 3. Atomic Database Ingestion via PL/pgSQL RPC
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

    // 4. Update channel_identities avatar and display name if available
    if (event.senderDisplayName && !isGenericDisplayName(event.senderDisplayName)) {
      await Promise.all([
        admin
          .from('channel_identities')
          .update({
            display_name: event.senderDisplayName,
            ...(fetchedAvatarUrl ? { avatar_url: fetchedAvatarUrl } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('channel', event.channel)
          .eq('external_id', event.externalSenderId),
        ingestResult?.lead_id
          ? admin
              .from('leads')
              .update({
                full_name: event.senderDisplayName,
                updated_at: new Date().toISOString(),
              })
              .eq('id', ingestResult.lead_id)
              .in('full_name', [
                'Facebook User',
                'Instagram User',
                'WhatsApp User',
                'Contact',
                'Unknown',
              ])
          : Promise.resolve(),
      ]);
    } else if (fetchedAvatarUrl) {
      await admin
        .from('channel_identities')
        .update({
          avatar_url: fetchedAvatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('channel', event.channel)
        .eq('external_id', event.externalSenderId);
    }

    // 5. Asynchronously process media attachment if present
    if (
      ingestResult?.message_id &&
      (event.messageType !== 'text' || event.mediaUrl || event.externalMediaId)
    ) {
      const targetMediaType = (['image', 'audio', 'video', 'document'].includes(event.messageType)
        ? event.messageType
        : 'document') as MessageAttachmentType;

      void processInboundMedia({
        conversationId: ingestResult.conversation_id,
        messageId: ingestResult.message_id,
        channel: event.channel,
        mediaType: targetMediaType,
        externalMediaId: event.externalMediaId,
        mediaUrl: event.mediaUrl,
        fileName: event.mediaFileName,
        mimeType: event.mediaMimeType,
        caption: event.caption || (event.content && !event.content.startsWith('[') ? event.content : null),
      }).catch((err) => {
        console.error('[Inbound Webhook after()] Media download error:', err);
      });
    }

    // 6. Audit Logging
    if (ingestResult?.message_id && !ingestResult.is_duplicate_message) {
      void writeAuditLog({
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
      }).catch((err) => console.error('[Inbound Webhook after()] Audit log error:', err));
    }

    if (ingestResult?.assigned_to) {
      void writeAuditLog({
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
      }).catch((err) => console.error('[Inbound Webhook after()] Audit log error:', err));
    }

    // 7. Mark event as processed
    await admin
      .from('webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', rawEventId);

    console.log(`[Inbound Webhook after()] Successfully processed event ${event.eventId} (msgId: ${ingestResult?.message_id}, convId: ${ingestResult?.conversation_id})`);
  } catch (err: unknown) {
    const errorObj = err as Error;
    console.error('[Inbound Webhook after()] Background processing error:', {
      rawEventId,
      eventId: event.eventId,
      error: errorObj?.message || String(err),
    });

    await admin
      .from('webhook_events')
      .update({
        status: 'failed',
        error_message: errorObj?.message || String(err),
      })
      .eq('id', rawEventId);
  }
}

/**
 * POST Handler — Fast Sub-300ms Webhook ACK with Background Processing
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  console.log(`[Inbound Webhook POST] Inbound request received (payload size: ${rawBody.length} bytes, hasSignature: ${!!req.headers.get('x-hub-signature-256') || !!req.headers.get('x-hub-signature')})`);

  // 1. Signature & Authorization Verification (Constant-Time HMAC)
  const signatureHeader =
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-hub-signature');
  const authHeader = req.headers.get('authorization');
  const webhookSecretHeader = req.headers.get('x-webhook-secret');
  const appSecret = process.env.META_APP_SECRET?.trim();
  const igAppSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  const waAppSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let isAuthorized = false;
  let signatureVerified = false;

  if (signatureHeader && (appSecret || igAppSecret || waAppSecret)) {
    if (appSecret) {
      signatureVerified = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    }
    if (!signatureVerified && igAppSecret) {
      signatureVerified = verifyMetaSignature(rawBody, signatureHeader, igAppSecret);
    }
    if (!signatureVerified && waAppSecret) {
      signatureVerified = verifyMetaSignature(rawBody, signatureHeader, waAppSecret);
    }
    isAuthorized = signatureVerified;
  } else if (
    authHeader &&
    serviceKey &&
    (authHeader === `Bearer ${serviceKey}` || authHeader === serviceKey)
  ) {
    isAuthorized = true; // Internal service key authorization
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
    console.warn('[Inbound Webhook POST] Unauthorized request rejected');
    return NextResponse.json(
      { error: 'Unauthorized: Invalid signature or access token' },
      { status: 401 }
    );
  }

  // 2. Parse JSON Payload
  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (err: unknown) {
    const errorObj = err as Error;
    console.error('[Inbound Webhook POST] Malformed JSON payload:', errorObj?.message);
    return NextResponse.json(
      { error: 'Bad Request: Malformed JSON body' },
      { status: 400 }
    );
  }

  // 3. Normalize Inbound Events
  const normalizedEvents = normalizeInboundPayload(rawPayload);

  if (!normalizedEvents || normalizedEvents.length === 0) {
    const isWhatsAppStatus =
      rawPayload?.object === 'whatsapp_business_account' &&
      Array.isArray((rawPayload as Record<string, unknown>)?.entry);

    return NextResponse.json({
      success: true,
      status: 'ignored',
      reason: isWhatsAppStatus ? 'whatsapp_status_update' : 'no_supported_events',
    });
  }

  // 4. Raw-First Persistence in app.webhook_events
  const acceptedTasks: Array<{ rawEventId: string; event: NormalizedInboundEvent }> = [];

  for (const event of normalizedEvents) {
    // Check if duplicate already processed
    const { data: existingEvent } = await admin
      .from('webhook_events')
      .select('id, status')
      .eq('channel', event.channel)
      .eq('event_id', event.eventId)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === 'processed') {
        continue; // Already processed idempotently
      }
      acceptedTasks.push({ rawEventId: existingEvent.id, event });
    } else {
      const { data: newEvt, error: evtErr } = await admin
        .from('webhook_events')
        .insert({
          channel: event.channel,
          event_id: event.eventId,
          payload: rawPayload,
          headers,
          status: 'pending',
        })
        .select('id')
        .maybeSingle();

      if (newEvt?.id) {
        acceptedTasks.push({ rawEventId: newEvt.id, event });
      } else if (evtErr?.code === '23505') {
        const { data: reEvt } = await admin
          .from('webhook_events')
          .select('id, status')
          .eq('channel', event.channel)
          .eq('event_id', event.eventId)
          .maybeSingle();

        if (reEvt && reEvt.status !== 'processed') {
          acceptedTasks.push({ rawEventId: reEvt.id, event });
        }
      } else {
        console.error('[Inbound Webhook POST] Failed to insert raw webhook event into DB:', {
          channel: event.channel,
          eventId: event.eventId,
          error: evtErr,
        });
      }
    }
  }

  console.log(`[Inbound Webhook POST] Ingestion accepted ${acceptedTasks.length} task(s) out of ${normalizedEvents.length} event(s)`);

  // 5. Schedule background execution via next/server after()
  if (acceptedTasks.length > 0) {
    after(async () => {
      try {
        for (const task of acceptedTasks) {
          await processInboundEventBackground(task.rawEventId, task.event, admin);
        }
      } catch (fatalErr) {
        console.error('[Inbound Webhook after()] Fatal background execution error:', fatalErr);
      }
    });
  }

  // 6. Return sub-300ms HTTP 200 Response immediately to Meta
  return NextResponse.json({
    success: true,
    status: 'received',
    accepted_count: acceptedTasks.length,
  });
}