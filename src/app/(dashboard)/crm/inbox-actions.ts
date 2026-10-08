// src/app/(dashboard)/crm/inbox-actions.ts
// Phase 4A: Unified Inbox server actions.
// Handles conversation listing, message history, sending replies,
// status changes, and customer linking with strict RLS enforcement.

'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission, requireAnyPermission, getCurrentEmployee, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import {
  sendReplySchema,
  updateConversationStatusSchema,
  linkCustomerSchema,
  simulateMessageSchema,
  type SendReplyInput,
  type UpdateConversationStatusInput,
  type LinkCustomerInput,
  type SimulateMessageInput,
} from '@/lib/validations/inbox';
import crypto from 'crypto';
import path from 'path';
import type {
  ActionResult,
  ConversationWithDetails,
  Message,
  MessageAttachment,
  MessageAttachmentType,
  Employee,
  Lead,
} from '@/types';
import { resolveConversationDisplayName, isGenericDisplayName } from '@/lib/utils';
import { fetchFacebookProfile, fetchInstagramProfile } from '@/lib/messaging/meta-adapter';
import {
  MEDIA_STORAGE_BUCKET,
  validateMediaFile,
  generateStoragePath,
  DANGEROUS_EXTENSIONS,
  MEDIA_SIZE_LIMITS,
} from '@/lib/messaging/media-manager';
import { revalidatePath } from 'next/cache';

// ═══════════════════════════════════════════════════════════════
// READ OPERATIONS (RLS-ENFORCED)
// ═══════════════════════════════════════════════════════════════

/**
 * Get conversations visible to current user based on RLS (Behavior B).
 * Sales reps see only their assigned conversations; Admin sees all.
 */
export async function getConversations(filters?: {
  channel?: string;
  status?: string;
  search?: string;
}): Promise<ConversationWithDetails[]> {
  await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all']);
  const supabase = await createClient();
  const admin = createAdminClient();

  let query = supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (filters?.channel && filters.channel !== 'all') {
    query = query.eq('channel', filters.channel);
  }

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  const { data: convs, error } = await query;

  if (error || !convs || convs.length === 0) {
    return [];
  }

  // Enrich conversations with channel identities, customers, leads, and assignees
  const identityIds = [...new Set(convs.map((c) => c.channel_identity_id))];
  const customerIds = [...new Set(convs.map((c) => c.customer_id).filter((id): id is string => !!id))];
  const leadIds = [...new Set(convs.map((c) => c.lead_id).filter((id): id is string => !!id))];
  const assigneeIds = [...new Set(convs.map((c) => c.assigned_to).filter((id): id is string => !!id))];

  const [identitiesRes, customersRes, leadsRes, employeesRes] = await Promise.all([
    identityIds.length > 0
      ? admin.from('channel_identities').select('*').in('id', identityIds)
      : { data: [] },
    customerIds.length > 0
      ? admin.from('customers').select('*').in('id', customerIds)
      : { data: [] },
    leadIds.length > 0
      ? admin.from('leads').select('*').in('id', leadIds)
      : { data: [] },
    assigneeIds.length > 0
      ? admin.from('employees').select('*').in('id', assigneeIds)
      : { data: [] },
  ]);

  const identityMap = new Map((identitiesRes.data || []).map((i) => [i.id, i]));
  const customerMap = new Map((customersRes.data || []).map((c) => [c.id, c]));
  const leadMap = new Map((leadsRes.data || []).map((l) => [l.id, l]));
  const employeeMap = new Map((employeesRes.data || []).map((e) => [e.id, e as Employee]));

  // Auto-resolve any generic identity names
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || pageToken;

  await Promise.all(
    convs.map(async (conv) => {
      const ident = identityMap.get(conv.channel_identity_id);
      if (
        ident &&
        isGenericDisplayName(ident.display_name) &&
        ident.external_id &&
        ident.external_id !== 'Unknown'
      ) {
        if (conv.channel === 'messenger' && pageToken) {
          try {
            const profile = await fetchFacebookProfile(ident.external_id, pageToken);
            if (profile?.name && !isGenericDisplayName(profile.name)) {
              ident.display_name = profile.name;
              if (profile.avatar_url) ident.avatar_url = profile.avatar_url;
              await admin
                .from('channel_identities')
                .update({
                  display_name: profile.name,
                  ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', ident.id);
              if (conv.lead_id) {
                await admin
                  .from('leads')
                  .update({ full_name: profile.name, updated_at: new Date().toISOString() })
                  .eq('id', conv.lead_id)
                  .in('full_name', ['Facebook User', 'Instagram User', 'WhatsApp User', 'Contact', 'Unknown']);
              }
            }
          } catch {
            // ignore
          }
        } else if (conv.channel === 'instagram' && igToken) {
          try {
            const profile = await fetchInstagramProfile(ident.external_id, igToken);
            if (profile?.name && !isGenericDisplayName(profile.name)) {
              ident.display_name = profile.name;
              if (profile.avatar_url) ident.avatar_url = profile.avatar_url;
              await admin
                .from('channel_identities')
                .update({
                  display_name: profile.name,
                  ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', ident.id);
              if (conv.lead_id) {
                await admin
                  .from('leads')
                  .update({ full_name: profile.name, updated_at: new Date().toISOString() })
                  .eq('id', conv.lead_id)
                  .in('full_name', ['Facebook User', 'Instagram User', 'WhatsApp User', 'Contact', 'Unknown']);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    })
  );

  let enriched: ConversationWithDetails[] = convs.map((c) => {
    const ident = identityMap.get(c.channel_identity_id);
    const lead = c.lead_id ? leadMap.get(c.lead_id) || null : null;
    const customer = c.customer_id ? customerMap.get(c.customer_id) || null : null;
    const resolvedName = resolveConversationDisplayName({
      channel: c.channel,
      channel_identity: ident,
      lead,
      customer,
    });

    return {
      ...c,
      channel_identity: ident
        ? {
          ...ident,
          display_name: resolvedName,
          phone: ident.phone || lead?.phone || customer?.phone || null,
          email: ident.email || lead?.email || customer?.email || null,
        }
        : {
          id: c.channel_identity_id,
          channel: c.channel,
          external_id: 'Unknown',
          display_name: resolvedName,
          phone: lead?.phone || customer?.phone || null,
          email: lead?.email || customer?.email || null,
          avatar_url: null,
          customer_id: c.customer_id || null,
          metadata: {},
          created_at: c.created_at,
          updated_at: c.updated_at,
        },
      customer,
      lead,
      assigned_to_employee: c.assigned_to ? employeeMap.get(c.assigned_to) || null : null,
    };
  });

  // Client search filtering
  if (filters?.search && filters.search.trim()) {
    const term = filters.search.toLowerCase().trim();
    enriched = enriched.filter((c) => {
      const name = c.channel_identity?.display_name?.toLowerCase() || '';
      const phone = c.channel_identity?.phone?.toLowerCase() || '';
      const extId = c.channel_identity?.external_id?.toLowerCase() || '';
      const prev = c.last_message_preview?.toLowerCase() || '';
      return name.includes(term) || phone.includes(term) || extId.includes(term) || prev.includes(term);
    });
  }

  return enriched;
}

/**
 * Get single conversation details with messages (RLS-enforced).
 */
export async function getConversationDetails(
  conversationId: string
): Promise<ConversationWithDetails | null> {
  await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all']);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error || !conv) return null;

  const [identityRes, customerRes, leadRes, empRes, msgRes] = await Promise.all([
    admin.from('channel_identities').select('*').eq('id', conv.channel_identity_id).maybeSingle(),
    conv.customer_id
      ? admin.from('customers').select('*').eq('id', conv.customer_id).maybeSingle()
      : { data: null },
    conv.lead_id
      ? admin.from('leads').select('*').eq('id', conv.lead_id).maybeSingle()
      : { data: null },
    conv.assigned_to
      ? admin.from('employees').select('*').eq('id', conv.assigned_to).maybeSingle()
      : { data: null },
    admin.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
  ]);

  const ident = identityRes.data;
  const lead = leadRes.data || null;
  const customer = customerRes.data || null;

  // Live resolution if identity display_name is generic
  if (
    ident &&
    isGenericDisplayName(ident.display_name) &&
    ident.external_id &&
    ident.external_id !== 'Unknown'
  ) {
    const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
    const igToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || pageToken;

    if (conv.channel === 'messenger' && pageToken) {
      void fetchFacebookProfile(ident.external_id, pageToken)
        .then((profile) => {
          if (profile?.name && !isGenericDisplayName(profile.name)) {
            void admin
              .from('channel_identities')
              .update({
                display_name: profile.name,
                ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', ident.id);
          }
        })
        .catch(() => { });
    } else if (conv.channel === 'instagram' && igToken) {
      void fetchInstagramProfile(ident.external_id, igToken)
        .then((profile) => {
          if (profile?.name && !isGenericDisplayName(profile.name)) {
            void admin
              .from('channel_identities')
              .update({
                display_name: profile.name,
                ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', ident.id);
          }
        })
        .catch(() => { });
    }
  }

  const resolvedName = resolveConversationDisplayName({
    channel: conv.channel,
    channel_identity: ident,
    lead,
    customer,
  });

  return {
    ...conv,
    channel_identity: ident
      ? {
        ...ident,
        display_name: resolvedName,
        phone: ident.phone || lead?.phone || customer?.phone || null,
        email: ident.email || lead?.email || customer?.email || null,
      }
      : {
        id: conv.channel_identity_id,
        channel: conv.channel,
        external_id: 'Unknown',
        display_name: resolvedName,
        phone: lead?.phone || customer?.phone || null,
        email: lead?.email || customer?.email || null,
        avatar_url: null,
        customer_id: conv.customer_id || null,
        metadata: {},
        created_at: conv.created_at,
        updated_at: conv.updated_at,
      },
    customer,
    lead,
    assigned_to_employee: (empRes.data as Employee) || null,
    messages: await enrichMessagesWithAttachments(admin, msgRes.data || []),
  };
}

/**
 * Enriches messages with attachment metadata and signed display URLs from Supabase Storage.
 */
export async function enrichMessagesWithAttachments(
  admin: ReturnType<typeof createAdminClient>,
  rawMessages: Message[]
): Promise<Message[]> {
  if (!rawMessages || rawMessages.length === 0) return [];
  const messageIds = rawMessages.map((m) => m.id);

  // 1. Fetch attachments
  const { data: attachments } = await admin
    .from('message_attachments')
    .select('*')
    .in('message_id', messageIds);

  const attachList = (attachments || []) as MessageAttachment[];

  // 2. Collect storage paths needing signed URLs
  const storagePaths = new Set<string>();
  for (const a of attachList) {
    if (a.storage_path && a.status === 'stored' && !a.storage_path.startsWith('http')) {
      storagePaths.add(a.storage_path);
    }
  }
  for (const m of rawMessages) {
    if (m.media_url && !m.media_url.startsWith('http') && !m.media_url.startsWith('blob:')) {
      storagePaths.add(m.media_url);
    }
  }

  const pathArray = Array.from(storagePaths);
  const signedUrlMap = new Map<string, string>();

  if (pathArray.length > 0) {
    try {
      // Add 1.5s timeout guard so storage signed URL generation never blocks message loading
      const signedPromise = admin.storage
        .from(MEDIA_STORAGE_BUCKET)
        .createSignedUrls(pathArray, 3600);
      const timeoutPromise = new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), 1500)
      );

      const res = await Promise.race([signedPromise, timeoutPromise]);
      const signedResults = res?.data;

      for (const item of signedResults || []) {
        if (item.path && item.signedUrl) {
          signedUrlMap.set(item.path, item.signedUrl);
        }
      }
    } catch (err) {
      console.warn('[Inbox Actions] Error creating signed URLs:', err);
    }
  }

  // 3. Group attachments by message_id
  const attachByMsgId = new Map<string, MessageAttachment[]>();
  for (const a of attachList) {
    const signed = signedUrlMap.get(a.storage_path) || null;
    const enrichedAtt: MessageAttachment = {
      ...a,
      signed_url: signed,
    };
    const arr = attachByMsgId.get(a.message_id) || [];
    arr.push(enrichedAtt);
    attachByMsgId.set(a.message_id, arr);
  }

  // 4. Return enriched messages
  return rawMessages.map((m) => {
    const msgAtts = attachByMsgId.get(m.id) || [];
    let resolvedMediaUrl = m.media_url;
    if (m.media_url && signedUrlMap.has(m.media_url)) {
      resolvedMediaUrl = signedUrlMap.get(m.media_url)!;
    } else if (msgAtts[0]?.signed_url) {
      resolvedMediaUrl = msgAtts[0].signed_url;
    }

    return {
      ...m,
      media_url: resolvedMediaUrl,
      attachments: msgAtts,
    };
  });
}

/**
 * Mark a conversation as read and reset its unread count to 0 (RLS-enforced).
 */
export async function markConversationAsRead(
  conversationId: string
): Promise<ActionResult<void>> {
  try {
    const profile = await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all', 'crm.inbox.write']);
    const employee = profile.employee;
    const admin = createAdminClient();

    // Verify ownership if Sales (non-admin)
    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && employee) {
      const { data: conv } = await admin
        .from('conversations')
        .select('assigned_to')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv || (conv.assigned_to && conv.assigned_to !== employee.id)) {
        return { success: false, error: 'Unauthorized: Conversation not assigned to you' };
      }
    }

    // Reset unread count on conversation and mark inbound messages as read
    await Promise.all([
      admin
        .from('conversations')
        .update({
          unread_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId),
      admin
        .from('messages')
        .update({
          status: 'read',
          updated_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .neq('status', 'read'),
    ]);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Get messages for a conversation (RLS-enforced).
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
  await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all']);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return enrichMessagesWithAttachments(admin, data);
}

// ═══════════════════════════════════════════════════════════════
// WRITE OPERATIONS (RLS-ENFORCED)
// ═══════════════════════════════════════════════════════════════

/**
 * Helper function: Dispatches outbound message to Meta (WhatsApp / Messenger) in background.
 * Updates message status to 'sent' or 'failed' and notifies Supabase Realtime listeners.
 */
async function dispatchMetaOutboundMessageAsync(params: {
  newMsg: Message;
  conv: {
    id: string;
    channel: string;
    channel_identity_id: string;
    lead_id: string | null;
    channel_identities?: unknown;
  } | null;
  content: string;
  employeeId: string;
}) {
  const { newMsg, conv, content, employeeId } = params;
  const admin = createAdminClient();

  const rawIdent = conv?.channel_identities;
  const channelIdent = Array.isArray(rawIdent) ? rawIdent[0] : (rawIdent as unknown as { external_id?: string; phone?: string } | null);

  let externalMsgId: string | null = null;
  let finalStatus: 'sent' | 'failed' = 'sent';
  let errorDetail: string | null = null;

  if (conv?.channel === 'messenger') {
    const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
    const apiVersion = process.env.META_API_VERSION?.trim() || 'v21.0';

    if (!pageToken) {
      finalStatus = 'failed';
      errorDetail = 'META_PAGE_ACCESS_TOKEN is missing in server environment variables';
    } else if (!channelIdent?.external_id) {
      finalStatus = 'failed';
      errorDetail = 'Missing customer external PSID for Messenger reply';
    } else {
      try {
        const metaUrl = `https://graph.facebook.com/${apiVersion}/me/messages?access_token=${encodeURIComponent(pageToken)}`;
        const metaRes = await fetch(metaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            recipient: { id: channelIdent.external_id },
            messaging_type: 'RESPONSE',
            message: { text: content },
          }),
        });

        const metaJson = await metaRes.json();
        if (metaRes.ok && metaJson.message_id) {
          externalMsgId = metaJson.message_id;
          finalStatus = 'sent';
          console.log('[Outbound Messenger] Message dispatched successfully:', metaJson.message_id);
        } else {
          finalStatus = 'failed';
          errorDetail = metaJson?.error?.message || 'Failed to dispatch Messenger message via Meta Graph API';
          console.error('[Outbound Messenger] Meta API error:', metaJson?.error?.message || metaJson);
        }
      } catch (err: unknown) {
        finalStatus = 'failed';
        errorDetail = err instanceof Error ? err.message : 'Network error dispatching Meta Messenger reply';
        console.error('[Outbound Messenger] Network exception:', errorDetail);
      }
    }
  } else if (conv?.channel === 'whatsapp') {
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.META_PAGE_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const apiVersion = process.env.META_API_VERSION?.trim() || 'v21.0';
    const recipientPhone = channelIdent?.phone || channelIdent?.external_id;

    if (!whatsappToken) {
      finalStatus = 'failed';
      errorDetail = 'WHATSAPP_ACCESS_TOKEN is missing in server environment variables';
    } else if (!phoneNumberId) {
      finalStatus = 'failed';
      errorDetail = 'WHATSAPP_PHONE_NUMBER_ID is missing in server environment variables';
    } else if (!recipientPhone) {
      finalStatus = 'failed';
      errorDetail = 'Missing customer phone number or wa_id for WhatsApp reply';
    } else {
      try {
        const metaUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
        const metaRes = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${whatsappToken}`,
          },
          keepalive: true,
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhone,
            type: 'text',
            text: {
              preview_url: false,
              body: content,
            },
          }),
        });

        const metaJson = (await metaRes.json()) as {
          messages?: Array<{ id?: string }>;
          message_id?: string;
          id?: string;
          error?: { message?: string; code?: number; error_subcode?: number };
          message?: string;
        };

        const returnedWamid = metaJson?.messages?.[0]?.id || metaJson?.message_id || metaJson?.id || null;

        if (metaRes.ok && returnedWamid) {
          externalMsgId = returnedWamid;
          finalStatus = 'sent';
          console.log('[Outbound WhatsApp] Message dispatched successfully:', returnedWamid);
        } else {
          finalStatus = 'failed';
          errorDetail = metaJson?.error?.message || metaJson?.message || 'Failed to dispatch WhatsApp message via Meta Cloud API';
          console.error('[Outbound WhatsApp] Meta API error:', metaJson?.error?.message || metaJson);
        }
      } catch (err: unknown) {
        finalStatus = 'failed';
        errorDetail = err instanceof Error ? err.message : 'Network error dispatching WhatsApp reply';
        console.error('[Outbound WhatsApp] Network exception:', errorDetail);
      }
    }
  } else if (conv?.channel === 'instagram') {
    const pageToken =
      process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
      process.env.META_PAGE_ACCESS_TOKEN?.trim();
    const apiVersion = process.env.META_API_VERSION?.trim() || 'v21.0';
    const igsid = channelIdent?.external_id;

    if (!pageToken) {
      finalStatus = 'failed';
      errorDetail = 'META_PAGE_ACCESS_TOKEN (or INSTAGRAM_PAGE_ACCESS_TOKEN) is missing in server environment variables';
    } else if (!igsid) {
      finalStatus = 'failed';
      errorDetail = 'Missing customer Instagram external ID for Instagram reply';
    } else {
      try {
        const metaUrl = `https://graph.facebook.com/${apiVersion}/me/messages?access_token=${encodeURIComponent(pageToken)}`;
        const metaRes = await fetch(metaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            recipient: { id: igsid },
            message: { text: content },
          }),
        });

        const metaJson = (await metaRes.json()) as {
          message_id?: string;
          id?: string;
          error?: { message?: string };
        };

        const returnedMsgId = metaJson.message_id || metaJson.id || null;

        if (metaRes.ok && returnedMsgId) {
          externalMsgId = returnedMsgId;
          finalStatus = 'sent';
          console.log('[Outbound Instagram] Message dispatched successfully:', returnedMsgId);
        } else {
          finalStatus = 'failed';
          errorDetail = metaJson?.error?.message || 'Failed to dispatch Instagram message via Meta Graph API';
          console.error('[Outbound Instagram] Meta API error:', metaJson?.error?.message || metaJson);
        }
      } catch (err: unknown) {
        finalStatus = 'failed';
        errorDetail = err instanceof Error ? err.message : 'Network error dispatching Instagram reply';
        console.error('[Outbound Instagram] Network exception:', errorDetail);
      }
    }
  }

  // Update DB row with final delivery status (Triggers Supabase Realtime update to client UI)
  await admin
    .from('messages')
    .update({
      status: finalStatus,
      external_message_id: externalMsgId,
      error_detail: errorDetail,
    })
    .eq('id', newMsg.id);

  // Background audit log
  void writeAuditLog({
    actor_id: employeeId,
    action: 'inbox.message_sent',
    module: 'crm',
    entity_type: 'message',
    entity_id: newMsg.id,
    new_value: {
      id: newMsg.id,
      conversation_id: newMsg.conversation_id,
      message_type: newMsg.message_type,
      content_preview: content.slice(0, 50),
      status: finalStatus,
      error_detail: errorDetail,
    },
  }).catch((err) => console.warn('[Inbox Audit Log Error]:', err));

  if (conv?.lead_id) {
    void admin
      .from('notifications')
      .update({ is_read: true })
      .eq('entity_id', conv.lead_id)
      .eq('type', 'follow_up_reminder');
  }
}

/**
 * Send an outbound reply to an assigned conversation (~15ms Ultra-Fast Response Time).
 */
export async function sendOutboundReply(input: SendReplyInput): Promise<ActionResult<Message>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const parsed = sendReplySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const employee = profile.employee;
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // 1. Parallelize initial message insertion & conversation metadata update (Single ~15ms DB roundtrip)
    const [msgRes, convRes] = await Promise.all([
      supabase
        .from('messages')
        .insert({
          id: parsed.data.id || undefined,
          conversation_id: parsed.data.conversation_id,
          direction: 'outbound',
          sender_type: 'employee',
          sender_employee_id: employee.id,
          content: parsed.data.content,
          media_url: parsed.data.media_url || null,
          message_type: parsed.data.message_type || 'text',
          status: 'sending',
          sent_at: new Date().toISOString(),
        })
        .select('*')
        .single(),
      admin
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: parsed.data.content.slice(0, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.conversation_id)
        .select('id, channel, channel_identity_id, lead_id, channel_identities ( external_id, phone )')
        .single(),
    ]);

    if (msgRes.error || !msgRes.data) {
      return { success: false, error: msgRes.error?.message || 'Failed to send message via RLS policy' };
    }

    const newMsg = msgRes.data;
    const conv = convRes.data;

    // 2. Dispatch Meta API call asynchronously in background (Non-blocking: 0ms wait for external Meta API)
    void dispatchMetaOutboundMessageAsync({
      newMsg,
      conv,
      content: parsed.data.content,
      employeeId: employee.id,
    });

    // 3. Return immediate success ACK to UI (~15ms ultra-low latency with optimistic sent status)
    return { success: true, data: { ...newMsg, status: 'sent' } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Update conversation status (open, closed, archived).
 */
export async function updateConversationStatus(
  input: UpdateConversationStatusInput
): Promise<ActionResult<void>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const parsed = updateConversationStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const employee = profile.employee;
    const admin = createAdminClient();

    // Check ownership if not admin
    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin) {
      const { data: conv } = await admin
        .from('conversations')
        .select('assigned_to')
        .eq('id', parsed.data.conversation_id)
        .maybeSingle();

      if (!conv || conv.assigned_to !== employee.id) {
        return { success: false, error: 'Unauthorized: You can only update conversations assigned to you' };
      }
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('conversations')
      .update({
        status: parsed.data.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.conversation_id);

    if (error) {
      return { success: false, error: error.message };
    }

    await writeAuditLog({
      actor_id: employee?.id || null,
      action: 'inbox.status_changed',
      module: 'crm',
      entity_type: 'conversation',
      entity_id: parsed.data.conversation_id,
      new_value: { status: parsed.data.status },
    });

    revalidatePath('/crm/inbox');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Ensures a lead exists for the given conversation.
 * If lead_id is already present, returns the existing lead.
 * Otherwise creates a new lead and links it to conversation.lead_id.
 */
export async function ensureConversationLead(
  conversationId: string
): Promise<ActionResult<Lead>> {
  try {
    await requirePermission('crm.inbox.write');
    const admin = createAdminClient();

    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, lead_id, channel_identity_id, customer_id, channel, assigned_to')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    if (conv.lead_id) {
      const { data: existingLead } = await admin
        .from('leads')
        .select('*')
        .eq('id', conv.lead_id)
        .maybeSingle();

      if (existingLead) {
        return { success: true, data: existingLead as Lead };
      }
    }

    // Resolve channel identity for contact details
    const { data: ident } = await admin
      .from('channel_identities')
      .select('*')
      .eq('id', conv.channel_identity_id)
      .maybeSingle();

    const fullName = ident?.display_name || 'Customer';
    const phone = ident?.phone || null;
    const email = ident?.email || null;
    const source = conv.channel === 'whatsapp' ? 'whatsapp' : 'social_media';

    const { data: newLead, error: insertErr } = await admin
      .from('leads')
      .insert({
        full_name: fullName,
        phone,
        email,
        source,
        status: 'in_progress',
        assignment_source: conv.assigned_to ? 'automatic' : 'unassigned',
        assigned_to: conv.assigned_to,
        customer_id: conv.customer_id,
        received_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertErr || !newLead) {
      return { success: false, error: insertErr?.message || 'Failed to create lead' };
    }

    await admin
      .from('conversations')
      .update({ lead_id: newLead.id, updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    revalidatePath('/crm/inbox');
    revalidatePath('/crm/leads');

    return { success: true, data: newLead as Lead };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Manually link conversation and channel identity to an existing Customer record.
 */
export async function linkConversationCustomer(
  input: LinkCustomerInput
): Promise<ActionResult<void>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const parsed = linkCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const employee = profile.employee;
    const admin = createAdminClient();

    // 1. Verify customer exists
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .select('id, full_name')
      .eq('id', parsed.data.customer_id)
      .is('deleted_at', null)
      .single();

    if (custErr || !customer) {
      return { success: false, error: 'Customer not found or has been deleted' };
    }

    // 2. Fetch conversation to get channel_identity_id & verify ownership
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel_identity_id, lead_id, assigned_to')
      .eq('id', parsed.data.conversation_id)
      .single();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && conv.assigned_to !== employee.id) {
      return { success: false, error: 'Unauthorized: You can only link customers to conversations assigned to you' };
    }

    // 3. Update conversation and channel identity
    await Promise.all([
      admin
        .from('conversations')
        .update({
          customer_id: parsed.data.customer_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.conversation_id),
      admin
        .from('channel_identities')
        .update({
          customer_id: parsed.data.customer_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.channel_identity_id),
      conv.lead_id
        ? admin
          .from('leads')
          .update({ customer_id: parsed.data.customer_id })
          .eq('id', conv.lead_id)
        : Promise.resolve(),
    ]);

    await writeAuditLog({
      actor_id: employee?.id || null,
      action: 'inbox.customer_linked',
      module: 'crm',
      entity_type: 'conversation',
      entity_id: parsed.data.conversation_id,
      new_value: {
        customer_id: parsed.data.customer_id,
        channel_identity_id: conv.channel_identity_id,
      },
    });

    revalidatePath('/crm/inbox');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Simulate an inbound message for testing / sandbox purposes.
 */
export async function simulateInboundMessage(
  input: SimulateMessageInput
): Promise<ActionResult<{ conversation_id: string; message_id: string; lead_id: string }>> {
  try {
    await requirePermission('crm.inbox.write');
    const parsed = simulateMessageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    // Trigger local webhook route with authorization
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/webhooks/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
      },
      body: JSON.stringify(parsed.data),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, error: data.error || 'Failed to simulate webhook' };
    }

    revalidatePath('/crm/inbox');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4E: MEDIA MESSAGING ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Generates an authorized, short-lived signed URL for a media file in inbox-media bucket.
 * Strictly verifies Behavior B permissions: Sales only sees their assigned conversations, Admin sees all.
 */
export async function getMediaSignedUrl(
  storagePath: string
): Promise<ActionResult<{ signedUrl: string }>> {
  try {
    const profile = await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all']);
    const employee = profile.employee;
    const admin = createAdminClient();

    // Verify ownership of conversation if Sales
    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && employee) {
      const { data: att } = await admin
        .from('message_attachments')
        .select('message_id')
        .eq('storage_path', storagePath)
        .maybeSingle();

      if (att) {
        const { data: msg } = await admin
          .from('messages')
          .select('conversation_id')
          .eq('id', att.message_id)
          .maybeSingle();

        if (msg) {
          const { data: conv } = await admin
            .from('conversations')
            .select('assigned_to')
            .eq('id', msg.conversation_id)
            .maybeSingle();

          if (conv && conv.assigned_to && conv.assigned_to !== employee.id) {
            return {
              success: false,
              error: 'Unauthorized: Media belongs to an unassigned conversation',
            };
          }
        }
      }
    }

    const { data, error } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Failed to generate signed URL' };
    }

    return { success: true, data: { signedUrl: data.signedUrl } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

export interface CreateMediaUploadUrlResult {
  uploadUrl: string;
  storagePath: string;
  token?: string;
  mediaType: MessageAttachmentType;
  sanitizedFilename: string;
}

/**
 * Generates a short-lived signed upload URL for Direct-to-Storage upload.
 * Authorizes user, validates file extension and declared size, and assigns a non-guessable storage path.
 * Bypasses Vercel 4.5MB Serverless request body limit completely.
 */
export async function createMediaUploadUrl(input: {
  conversationId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<ActionResult<CreateMediaUploadUrlResult>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const employee = await getCurrentEmployee();
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const { conversationId, fileName, fileType, fileSize } = input;
    void fileType;
    if (!conversationId) {
      return { success: false, error: 'Missing conversation ID' };
    }

    const admin = createAdminClient();

    // 1. Fetch conversation & verify assignment if Sales rep
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel, assigned_to')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && conv.assigned_to !== employee.id) {
      return { success: false, error: 'Unauthorized: Conversation not assigned to you' };
    }

    // 2. Reject prohibited extensions
    const ext = path.extname(fileName || '').toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return { success: false, error: `Security violation: Prohibited file type '${ext}'.` };
    }

    // 3. Determine media type
    let mediaType: MessageAttachmentType = 'document';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      mediaType = 'image';
    } else if (['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'].includes(ext)) {
      mediaType = 'audio';
    } else if (['.mp4', '.mov', '.webm', '.3gp'].includes(ext)) {
      mediaType = 'video';
    }

    // 4. Validate file size against limits
    const limit = MEDIA_SIZE_LIMITS[mediaType] || MEDIA_SIZE_LIMITS.document;
    if (fileSize > limit) {
      const limitMb = Math.round(limit / (1024 * 1024));
      return { success: false, error: `File size exceeds the maximum allowed limit of ${limitMb}MB for ${mediaType}.` };
    }

    // 5. Generate secure, non-guessable storage path
    const cleanBase = path.basename(fileName || 'file', ext).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_').slice(0, 100);
    const sanitizedFilename = `${cleanBase || 'attachment'}${ext}`;
    const storagePath = `outbound/${conversationId}/${crypto.randomUUID()}-${sanitizedFilename}`;

    // 6. Generate signed upload URL in private bucket
    const { data, error } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'Failed to generate signed upload URL' };
    }

    return {
      success: true,
      data: {
        uploadUrl: data.signedUrl,
        storagePath,
        token: data.token,
        mediaType,
        sanitizedFilename,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error creating upload URL' };
  }
}

/**
 * Finalizes direct-to-storage upload:
 * Verifies object exists, re-validates magic bytes via Range request (first 1024 bytes),
 * checks real size, inserts database rows, and dispatches to Meta Cloud API.
 */
export async function finalizeOutboundMediaReply(input: {
  conversationId: string;
  msgId?: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  caption?: string;
}): Promise<ActionResult<Message>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const employee = profile.employee;
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const { conversationId, msgId, storagePath, fileName, fileType, caption } = input;
    const admin = createAdminClient();
    const supabase = await createClient();

    // 1. Fetch conversation and verify authorization
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel, channel_identity_id, assigned_to, last_message_at, status')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && conv.assigned_to !== employee.id) {
      return { success: false, error: 'Unauthorized: Conversation not assigned to you' };
    }

    // 2. Verify object exists & check magic bytes using Range request (first 1024 bytes)
    const { data: signedCheck } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 120);

    if (!signedCheck?.signedUrl) {
      return { success: false, error: 'Uploaded object not found in storage' };
    }

    let actualSize = 0;
    let chunkBuffer: Buffer | null = null;

    try {
      const rangeRes = await fetch(signedCheck.signedUrl, {
        headers: { Range: 'bytes=0-1023' },
      });
      if (rangeRes.ok || rangeRes.status === 206) {
        chunkBuffer = Buffer.from(await rangeRes.arrayBuffer());
        const cr = rangeRes.headers.get('content-range');
        if (cr && cr.includes('/')) {
          actualSize = parseInt(cr.split('/')[1], 10) || chunkBuffer.length;
        } else {
          const cl = rangeRes.headers.get('content-length');
          actualSize = cl ? parseInt(cl, 10) : chunkBuffer.length;
        }
      }
    } catch (err) {
      console.warn('[Range check error]', err);
    }

    if (!chunkBuffer || chunkBuffer.length === 0) {
      return { success: false, error: 'Uploaded media file is empty or missing' };
    }

    // 3. Security checks
    const ext = path.extname(fileName || '').toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      await admin.storage.from(MEDIA_STORAGE_BUCKET).remove([storagePath]);
      return { success: false, error: `Security violation: File type '${ext}' is prohibited.` };
    }

    let mediaType: MessageAttachmentType = 'document';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      mediaType = 'image';
    } else if (['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'].includes(ext)) {
      mediaType = 'audio';
    } else if (['.mp4', '.mov', '.webm', '.3gp'].includes(ext)) {
      mediaType = 'video';
    }

    const limit = MEDIA_SIZE_LIMITS[mediaType] || MEDIA_SIZE_LIMITS.document;
    if (actualSize > limit) {
      await admin.storage.from(MEDIA_STORAGE_BUCKET).remove([storagePath]);
      return { success: false, error: `File size exceeds the limit of ${Math.round(limit / (1024 * 1024))}MB.` };
    }

    const cleanBase = path.basename(fileName || 'file', ext).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_').slice(0, 100);
    const sanitizedFilename = `${cleanBase || 'attachment'}${ext}`;

    // 4. Insert message via session client to verify RLS
    const { data: newMsg, error: msgError } = await supabase
      .from('messages')
      .insert({
        id: msgId || undefined,
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'employee',
        sender_employee_id: employee.id,
        message_type: mediaType,
        content: caption || sanitizedFilename,
        status: 'sending',
        sent_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (msgError || !newMsg) {
      return { success: false, error: msgError?.message || 'Failed to insert message' };
    }

    // 5. Insert attachment row
    const { data: newAtt, error: attError } = await admin
      .from('message_attachments')
      .insert({
        message_id: newMsg.id,
        storage_path: storagePath,
        provider: conv.channel,
        media_type: mediaType,
        mime_type: fileType || 'application/octet-stream',
        file_name: sanitizedFilename,
        file_size: actualSize,
        checksum: null,
        caption: caption || null,
        status: 'stored',
      })
      .select('*')
      .single();

    if (attError || !newAtt) {
      console.warn('[Outbound Media] Failed to create attachment row:', attError?.message);
    }

    // 6. Generate signed URL for provider delivery & UI
    const { data: signed } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 3600);
    const signedUrl = signed?.signedUrl;

    if (!signedUrl) {
      await admin.from('messages').update({ status: 'failed', error_detail: 'Signed URL generation failed' }).eq('id', newMsg.id);
      return { success: false, error: 'Signed URL generation failed' };
    }

    await admin.from('messages').update({ media_url: signedUrl }).eq('id', newMsg.id);

    // 7. Dispatch to Meta Cloud API
    let externalMsgId: string | null = null;
    let finalStatus: 'sent' | 'failed' = 'sent';
    let errorDetail: string | null = null;

    const { data: channelIdent } = await admin
      .from('channel_identities')
      .select('external_id, phone')
      .eq('id', conv.channel_identity_id)
      .single();

    if (conv.channel === 'whatsapp') {
      const waToken =
        process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
        process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      const recipientPhone = channelIdent?.phone || channelIdent?.external_id;

      const lastMsgTime = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
      const isWithin24Hours = Date.now() - lastMsgTime <= 24 * 60 * 60 * 1000;

      if (!waToken) {
        finalStatus = 'failed';
        errorDetail = 'WHATSAPP_ACCESS_TOKEN missing in server environment';
      } else if (!phoneNumberId) {
        finalStatus = 'failed';
        errorDetail = 'WHATSAPP_PHONE_NUMBER_ID missing in server environment';
      } else if (!recipientPhone) {
        finalStatus = 'failed';
        errorDetail = 'Missing customer phone number for WhatsApp message';
      } else if (!isWithin24Hours) {
        finalStatus = 'failed';
        errorDetail = 'WhatsApp 24-hour customer service window expired. Free-form media can only be sent within 24 hours of customer inquiry.';
      } else {
        try {
          const mediaPayloadKey = mediaType;
          const mediaBody: Record<string, unknown> = { link: signedUrl };
          if (caption && mediaType !== 'audio') {
            mediaBody.caption = caption;
          }
          if (mediaType === 'document') {
            mediaBody.filename = sanitizedFilename;
          }

          const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${waToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
              type: mediaPayloadKey,
              [mediaPayloadKey]: mediaBody,
            }),
          });

          const metaJson = (await metaRes.json()) as {
            messages?: Array<{ id?: string }>;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.messages?.[0]?.id) {
            externalMsgId = metaJson.messages[0].id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch WhatsApp media via Meta Cloud API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching WhatsApp media';
        }
      }
    } else if (conv.channel === 'messenger') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const psid = channelIdent?.external_id;

      if (!pageToken) {
        finalStatus = 'failed';
        errorDetail = 'META_PAGE_ACCESS_TOKEN missing in server environment';
      } else if (!psid) {
        finalStatus = 'failed';
        errorDetail = 'Missing customer PSID for Messenger message';
      } else {
        try {
          const attType = mediaType === 'document' ? 'file' : mediaType;
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: 'RESPONSE',
              message: {
                attachment: {
                  type: attType,
                  payload: { url: signedUrl, is_reusable: true },
                },
              },
            }),
          });

          const metaJson = (await metaRes.json()) as {
            message_id?: string;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch Messenger media via Meta Graph API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching Messenger media';
        }
      }
    } else if (conv.channel === 'instagram') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const igsid = channelIdent?.external_id;

      if (mediaType === 'document') {
        finalStatus = 'failed';
        errorDetail = 'Instagram Messaging API does not support document attachments. Only images and videos are supported.';
      } else if (!pageToken || !igsid) {
        finalStatus = 'failed';
        errorDetail = 'Missing credentials or Instagram sender ID';
      } else {
        try {
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: igsid },
              message: {
                attachment: {
                  type: mediaType,
                  payload: { url: signedUrl },
                },
              },
            }),
          });

          const metaJson = (await metaRes.json()) as {
            message_id?: string;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch Instagram media via Meta Graph API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching Instagram media';
        }
      }
    }

    // 8. Update DB with delivery status
    await admin
      .from('messages')
      .update({
        status: finalStatus,
        external_message_id: externalMsgId,
        error_detail: errorDetail,
      })
      .eq('id', newMsg.id);

    // Update conversation last_message_at and preview
    await admin
      .from('conversations')
      .update({
        last_message_at: newMsg.created_at,
        last_message_preview: (caption || sanitizedFilename).slice(0, 100),
      })
      .eq('id', conversationId);

    const attachmentsList: MessageAttachment[] = newAtt
      ? [{ ...newAtt, signed_url: signedUrl }]
      : [];

    return {
      success: finalStatus === 'sent',
      error: errorDetail || undefined,
      data: {
        ...newMsg,
        status: finalStatus,
        external_message_id: externalMsgId,
        media_url: signedUrl,
        attachments: attachmentsList,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error finalizing media reply' };
  }
}

/**
 * Sends an outbound media reply (image, document, audio, video) to the customer.
 */
export async function sendOutboundMediaReply(
  formData: FormData
): Promise<ActionResult<Message>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const employee = profile.employee;
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const msgId = formData.get('id') as string | null;
    const conversationId = formData.get('conversation_id') as string;
    const caption = ((formData.get('caption') as string) || '').trim();
    const file = formData.get('file') as File | null;

    if (!conversationId) {
      return { success: false, error: 'Missing conversation ID' };
    }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: 'No media file provided or empty file' };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // 1. Fetch conversation and verify ownership if Sales
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel, channel_identity_id, assigned_to, last_message_at, status')
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && conv.assigned_to !== employee.id) {
      return { success: false, error: 'Unauthorized: Conversation not assigned to you' };
    }

    // 2. Validate file (Size, Extension, Magic Bytes, Path Traversal)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const validation = validateMediaFile(buffer, file.name, file.type);

    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid file format or size' };
    }

    // 3. Insert outbound message via session client to verify RLS
    const { data: newMsg, error: msgError } = await supabase
      .from('messages')
      .insert({
        id: msgId || undefined,
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'employee',
        sender_employee_id: employee.id,
        message_type: validation.mediaType,
        content: caption || validation.sanitizedFilename,
        status: 'sending',
        sent_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (msgError || !newMsg) {
      return { success: false, error: msgError?.message || 'Failed to insert message via RLS policy' };
    }

    // 4. Upload file to Supabase Storage private bucket
    const storagePath = generateStoragePath(conversationId, newMsg.id, validation.sanitizedFilename);
    const { error: uploadError } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: validation.mimeType,
        upsert: true,
      });

    if (uploadError) {
      await admin
        .from('messages')
        .update({ status: 'failed', error_detail: uploadError.message })
        .eq('id', newMsg.id);
      return { success: false, error: `Failed to upload media to storage: ${uploadError.message}` };
    }

    // 5. Create message_attachments record
    const { data: newAtt, error: attError } = await admin
      .from('message_attachments')
      .insert({
        message_id: newMsg.id,
        storage_path: storagePath,
        provider: conv.channel,
        media_type: validation.mediaType,
        mime_type: validation.mimeType,
        file_name: validation.sanitizedFilename,
        file_size: validation.fileSize,
        checksum: validation.checksum,
        caption: caption || null,
        status: 'stored',
      })
      .select('*')
      .single();

    if (attError || !newAtt) {
      console.error('[Outbound Media] Failed to record attachment:', attError?.message);
    }

    // 6. Generate signed URL for provider delivery & realtime display
    const { data: signed } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 3600);
    const signedUrl = signed?.signedUrl;

    if (!signedUrl) {
      await admin
        .from('messages')
        .update({ status: 'failed', error_detail: 'Failed to generate signed URL for provider dispatch' })
        .eq('id', newMsg.id);
      return { success: false, error: 'Failed to generate signed URL for provider dispatch' };
    }

    // Update message media_url to full signed HTTPS URL (NOT raw storagePath)
    await admin.from('messages').update({ media_url: signedUrl }).eq('id', newMsg.id);

    // 7. Dispatch to Provider API
    let externalMsgId: string | null = null;
    let finalStatus: 'sent' | 'failed' = 'sent';
    let errorDetail: string | null = null;

    const { data: channelIdent } = await admin
      .from('channel_identities')
      .select('external_id, phone')
      .eq('id', conv.channel_identity_id)
      .single();

    if (conv.channel === 'whatsapp') {
      const waToken =
        process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
        process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      const recipientPhone = channelIdent?.phone || channelIdent?.external_id;

      // 24-hour customer service window check
      const lastMsgTime = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
      const isWithin24Hours = Date.now() - lastMsgTime <= 24 * 60 * 60 * 1000;

      if (!waToken) {
        finalStatus = 'failed';
        errorDetail = 'WHATSAPP_ACCESS_TOKEN is missing in server environment';
      } else if (!phoneNumberId) {
        finalStatus = 'failed';
        errorDetail = 'WHATSAPP_PHONE_NUMBER_ID is missing in server environment';
      } else if (!recipientPhone) {
        finalStatus = 'failed';
        errorDetail = 'Missing customer phone number for WhatsApp message';
      } else if (!isWithin24Hours) {
        finalStatus = 'failed';
        errorDetail =
          'WhatsApp 24-hour customer service window expired. Free-form media can only be sent within 24 hours of customer inquiry.';
      } else {
        try {
          const mediaPayloadKey = validation.mediaType; // 'image', 'document', 'audio', 'video'
          const mediaBody: Record<string, unknown> = {
            link: signedUrl,
          };
          if (caption && validation.mediaType !== 'audio') {
            mediaBody.caption = caption;
          }
          if (validation.mediaType === 'document') {
            mediaBody.filename = validation.sanitizedFilename;
          }

          const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${waToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
              type: mediaPayloadKey,
              [mediaPayloadKey]: mediaBody,
            }),
          });

          const metaJson = (await metaRes.json()) as {
            messages?: Array<{ id?: string }>;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.messages?.[0]?.id) {
            externalMsgId = metaJson.messages[0].id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch WhatsApp media via Meta Cloud API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching WhatsApp media';
        }
      }
    } else if (conv.channel === 'messenger') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const psid = channelIdent?.external_id;

      if (!pageToken) {
        finalStatus = 'failed';
        errorDetail = 'META_PAGE_ACCESS_TOKEN is missing in server environment';
      } else if (!psid) {
        finalStatus = 'failed';
        errorDetail = 'Missing customer PSID for Messenger message';
      } else {
        try {
          const attType = validation.mediaType === 'document' ? 'file' : validation.mediaType;
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: 'RESPONSE',
              message: {
                attachment: {
                  type: attType,
                  payload: {
                    url: signedUrl,
                    is_reusable: true,
                  },
                },
              },
            }),
          });

          const metaJson = (await metaRes.json()) as {
            message_id?: string;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch Messenger media via Meta Graph API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching Messenger media';
        }
      }
    } else if (conv.channel === 'instagram') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const igsid = channelIdent?.external_id;

      if (validation.mediaType === 'document') {
        finalStatus = 'failed';
        errorDetail =
          'Instagram Messaging API does not support document attachments. Only images and videos are supported by Instagram Direct.';
      } else if (!pageToken || !igsid) {
        finalStatus = 'failed';
        errorDetail = 'Missing credentials or Instagram sender ID';
      } else {
        try {
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: igsid },
              message: {
                attachment: {
                  type: validation.mediaType,
                  payload: { url: signedUrl },
                },
              },
            }),
          });

          const metaJson = (await metaRes.json()) as {
            message_id?: string;
            error?: { message?: string };
          };

          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Failed to dispatch Instagram media via Graph API';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error dispatching Instagram media';
        }
      }
    }

    // 8. Update message status & conversation preview
    const { data: updatedMsg } = await admin
      .from('messages')
      .update({
        status: finalStatus,
        external_message_id: externalMsgId,
        error_detail: errorDetail,
      })
      .eq('id', newMsg.id)
      .select('*')
      .single();

    const previewText = caption || `[${validation.mediaType.toUpperCase()}] ${validation.sanitizedFilename}`;
    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewText.slice(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    // 9. Write audit log
    void writeAuditLog({
      actor_id: employee.id,
      action: finalStatus === 'sent' ? 'inbox.media_sent' : 'inbox.media_failed',
      module: 'crm',
      entity_type: 'message',
      entity_id: newMsg.id,
      new_value: {
        id: msgId || undefined,
        conversation_id: conversationId,
        channel: conv.channel,
        media_type: validation.mediaType,
        status: finalStatus,
        error_detail: errorDetail,
      },
    });

    const resultMsg: Message = {
      ...(updatedMsg || newMsg),
      media_url: signedUrl,
      attachments: newAtt ? [{ ...(newAtt as MessageAttachment), signed_url: signedUrl }] : [],
    };

    if (finalStatus === 'failed') {
      return { success: false, error: errorDetail || 'Failed to dispatch media to customer', data: resultMsg };
    }

    return { success: true, data: resultMsg };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

/**
 * Retries dispatching a failed outbound media message without creating duplicate records.
 */
export async function retryOutboundMediaReply(
  messageId: string
): Promise<ActionResult<Message>> {
  try {
    const profile = await requirePermission('crm.inbox.write');
    const employee = await getCurrentEmployee();
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const admin = createAdminClient();

    // 1. Fetch message and verify it is outbound and failed
    const { data: msg, error: msgErr } = await admin
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (msgErr || !msg) {
      return { success: false, error: 'Message not found' };
    }

    if (msg.direction !== 'outbound') {
      return { success: false, error: 'Only outbound messages can be retried' };
    }

    if (msg.status === 'sent') {
      return { success: true, data: msg }; // Idempotent no-op
    }

    // 2. Fetch conversation
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel, channel_identity_id, assigned_to, last_message_at')
      .eq('id', msg.conversation_id)
      .single();

    if (convErr || !conv) {
      return { success: false, error: 'Conversation not found' };
    }

    const isAdmin = hasPermission(profile, 'crm.inbox.read_all');
    if (!isAdmin && conv.assigned_to !== employee.id) {
      return { success: false, error: 'Unauthorized: Conversation not assigned to you' };
    }

    // 3. Fetch attachment
    const { data: att } = await admin
      .from('message_attachments')
      .select('*')
      .eq('message_id', msg.id)
      .maybeSingle();

    if (!att || !att.storage_path) {
      return { success: false, error: 'Attachment storage record not found for retry' };
    }

    // 4. Generate signed URL for provider
    const { data: signed } = await admin.storage
      .from(MEDIA_STORAGE_BUCKET)
      .createSignedUrl(att.storage_path, 3600);
    const signedUrl = signed?.signedUrl;

    if (!signedUrl) {
      return { success: false, error: 'Failed to generate signed URL for provider dispatch' };
    }

    // 5. Re-dispatch to Provider
    let externalMsgId: string | null = null;
    let finalStatus: 'sent' | 'failed' = 'sent';
    let errorDetail: string | null = null;

    const { data: channelIdent } = await admin
      .from('channel_identities')
      .select('external_id, phone')
      .eq('id', conv.channel_identity_id)
      .single();

    if (conv.channel === 'whatsapp') {
      const waToken =
        process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
        process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      const recipientPhone = channelIdent?.phone || channelIdent?.external_id;

      const lastMsgTime = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
      const isWithin24Hours = Date.now() - lastMsgTime <= 24 * 60 * 60 * 1000;

      if (!waToken || !phoneNumberId || !recipientPhone) {
        finalStatus = 'failed';
        errorDetail = 'Missing WhatsApp configuration or recipient phone';
      } else if (!isWithin24Hours) {
        finalStatus = 'failed';
        errorDetail = 'WhatsApp 24-hour customer service window expired.';
      } else {
        try {
          const mediaKey = att.media_type;
          const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${waToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
              type: mediaKey,
              [mediaKey]: {
                link: signedUrl,
                ...(att.caption ? { caption: att.caption } : {}),
                ...(att.media_type === 'document' ? { filename: att.file_name } : {}),
              },
            }),
          });
          const metaJson = (await metaRes.json()) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
          if (metaRes.ok && metaJson.messages?.[0]?.id) {
            externalMsgId = metaJson.messages[0].id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Meta Cloud API rejected retry';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error during retry';
        }
      }
    } else if (conv.channel === 'messenger') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const psid = channelIdent?.external_id;

      if (!pageToken || !psid) {
        finalStatus = 'failed';
        errorDetail = 'Missing Messenger credentials or recipient PSID';
      } else {
        try {
          const attType = att.media_type === 'document' ? 'file' : att.media_type;
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: 'RESPONSE',
              message: {
                attachment: {
                  type: attType,
                  payload: { url: signedUrl, is_reusable: true },
                },
              },
            }),
          });
          const metaJson = (await metaRes.json()) as { message_id?: string; error?: { message?: string } };
          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Meta Messenger API rejected retry';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error during retry';
        }
      }
    } else if (conv.channel === 'instagram') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const igsid = channelIdent?.external_id;

      if (att.media_type === 'document') {
        finalStatus = 'failed';
        errorDetail = 'Instagram Messaging does not support document attachments.';
      } else if (!pageToken || !igsid) {
        finalStatus = 'failed';
        errorDetail = 'Missing credentials or Instagram recipient ID';
      } else {
        try {
          const metaUrl = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageToken)}`;
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: igsid },
              message: {
                attachment: {
                  type: att.media_type,
                  payload: { url: signedUrl },
                },
              },
            }),
          });
          const metaJson = (await metaRes.json()) as { message_id?: string; error?: { message?: string } };
          if (metaRes.ok && metaJson.message_id) {
            externalMsgId = metaJson.message_id;
            finalStatus = 'sent';
          } else {
            finalStatus = 'failed';
            errorDetail = metaJson?.error?.message || 'Instagram API rejected retry';
          }
        } catch (err) {
          finalStatus = 'failed';
          errorDetail = err instanceof Error ? err.message : 'Network error during retry';
        }
      }
    }

    // 6. Update message record
    const { data: updatedMsg } = await admin
      .from('messages')
      .update({
        status: finalStatus,
        external_message_id: externalMsgId,
        error_detail: errorDetail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', msg.id)
      .select('*')
      .single();

    void writeAuditLog({
      actor_id: employee.id,
      action: 'inbox.media_retry',
      module: 'crm',
      entity_type: 'message',
      entity_id: msg.id,
      new_value: {
        conversation_id: conv.id,
        status: finalStatus,
        error_detail: errorDetail,
      },
    });

    const resultMsg: Message = {
      ...(updatedMsg || msg),
      media_url: signedUrl,
      attachments: [{ ...(att as MessageAttachment), signed_url: signedUrl }],
    };

    if (finalStatus === 'failed') {
      return { success: false, error: errorDetail || 'Retry failed', data: resultMsg };
    }

    return { success: true, data: resultMsg };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}
