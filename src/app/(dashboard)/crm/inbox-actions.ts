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
import type {
  ActionResult,
  ConversationWithDetails,
  Message,
  Employee,
} from '@/types';
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

  let enriched: ConversationWithDetails[] = convs.map((c) => ({
    ...c,
    channel_identity: identityMap.get(c.channel_identity_id) || {
      id: c.channel_identity_id,
      channel: c.channel,
      external_id: 'Unknown',
      display_name: 'Contact',
      phone: null,
      email: null,
      avatar_url: null,
      customer_id: null,
      metadata: {},
      created_at: c.created_at,
      updated_at: c.updated_at,
    },
    customer: c.customer_id ? customerMap.get(c.customer_id) || null : null,
    lead: c.lead_id ? leadMap.get(c.lead_id) || null : null,
    assigned_to_employee: c.assigned_to ? employeeMap.get(c.assigned_to) || null : null,
  }));

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

  return {
    ...conv,
    channel_identity: identityRes.data || {
      id: conv.channel_identity_id,
      channel: conv.channel,
      external_id: 'Unknown',
      display_name: 'Contact',
      phone: null,
      email: null,
      avatar_url: null,
      customer_id: null,
      metadata: {},
      created_at: conv.created_at,
      updated_at: conv.updated_at,
    },
    customer: customerRes.data || null,
    lead: leadRes.data || null,
    assigned_to_employee: (empRes.data as Employee) || null,
    messages: msgRes.data || [],
  };
}

/**
 * Get messages for a conversation (RLS-enforced).
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
  await requireAnyPermission(['crm.inbox.read_own', 'crm.inbox.read_all']);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data;
}

// ═══════════════════════════════════════════════════════════════
// WRITE OPERATIONS (RLS-ENFORCED)
// ═══════════════════════════════════════════════════════════════

/**
 * Send an outbound reply to an assigned conversation.
 */
export async function sendOutboundReply(input: SendReplyInput): Promise<ActionResult<Message>> {
  try {
    await requirePermission('crm.inbox.write');
    const parsed = sendReplySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
    }

    const employee = await getCurrentEmployee();
    if (!employee) {
      return { success: false, error: 'Current employee record not found' };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // Insert message via session client to verify RLS policy
    const { data: newMsg, error: msgError } = await supabase
      .from('messages')
      .insert({
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
      .single();

    if (msgError || !newMsg) {
      return { success: false, error: msgError?.message || 'Failed to send message via RLS policy' };
    }

    // Check conversation channel & identity for external outbound dispatching
    const { data: conv } = await admin
      .from('conversations')
      .select('id, channel, channel_identity_id')
      .eq('id', parsed.data.conversation_id)
      .single();

    let externalMsgId: string | null = null;
    let finalStatus: 'sent' | 'failed' = 'sent';
    let errorDetail: string | null = null;

    if (conv?.channel === 'messenger') {
      const pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
      const apiVersion = process.env.META_API_VERSION?.trim() || 'v21.0';

      const { data: channelIdent } = await admin
        .from('channel_identities')
        .select('external_id')
        .eq('id', conv.channel_identity_id)
        .single();

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
            body: JSON.stringify({
              recipient: { id: channelIdent.external_id },
              messaging_type: 'RESPONSE',
              message: { text: parsed.data.content },
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

      const { data: channelIdent } = await admin
        .from('channel_identities')
        .select('external_id, phone')
        .eq('id', conv.channel_identity_id)
        .single();

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
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
              type: 'text',
              text: {
                preview_url: false,
                body: parsed.data.content,
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
    }

    // Update message status & external_message_id
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

    // Update conversation last message details
    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: parsed.data.content.slice(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.conversation_id);

    // Audit log
    await writeAuditLog({
      actor_id: employee.id,
      action: 'inbox.message_sent',
      module: 'crm',
      entity_type: 'message',
      entity_id: newMsg.id,
      new_value: {
        conversation_id: parsed.data.conversation_id,
        message_type: newMsg.message_type,
        content_preview: parsed.data.content.slice(0, 50),
        status: finalStatus,
        error_detail: errorDetail,
      },
    });

    revalidatePath('/crm/inbox');

    if (finalStatus === 'failed') {
      const fallbackChannelName = conv?.channel === 'whatsapp' ? 'WhatsApp' : 'Facebook Messenger';
      return { success: false, error: errorDetail || `Failed to deliver message to customer on ${fallbackChannelName}` };
    }

    return { success: true, data: updatedMsg || newMsg };
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
