// src/lib/messaging/meta-adapter.ts
// Normalization layer for Meta Webhook payloads (Facebook Messenger v26.0)
// Extracts standardized inbound events safely without spreading Meta-specific parsing throughout app logic.

import crypto from 'crypto';
import { ChannelType, MessageType } from '@/types';

export interface NormalizedInboundEvent {
  channel: ChannelType;
  eventId: string;
  externalSenderId: string;
  recipientPageId?: string | null;
  senderDisplayName?: string | null;
  senderPhone?: string | null;
  externalThreadId: string;
  externalMessageId?: string | null;
  messageType: MessageType;
  content: string;
  mediaUrl?: string | null;
  externalMediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  caption?: string | null;
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

export interface FetchedProfile {
  name: string | null;
  avatar_url: string | null;
}

const fbProfileCache = new Map<string, { profile: FetchedProfile; expiresAt: number }>();

/**
 * Fetches the Facebook account display name and avatar for a given PSID using Meta Graph API.
 * Uses direct PSID lookup with fallback to Page conversations endpoint and in-memory TTL caching.
 */
export async function fetchFacebookProfile(
  psid: string,
  pageToken: string,
  apiVersion = 'v21.0'
): Promise<FetchedProfile | null> {
  if (!psid || !pageToken) return null;

  // 1. Check in-memory cache
  const cached = fbProfileCache.get(psid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  // 2. Try direct PSID Graph API
  try {
    const url = `https://graph.facebook.com/${apiVersion}/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as {
        name?: string;
        first_name?: string;
        last_name?: string;
        profile_pic?: string;
      };
      const name =
        data.name?.trim() ||
        (data.first_name || data.last_name
          ? `${data.first_name || ''} ${data.last_name || ''}`.trim()
          : null);
      if (name) {
        const result: FetchedProfile = {
          name,
          avatar_url: data.profile_pic || null,
        };
        fbProfileCache.set(psid, { profile: result, expiresAt: Date.now() + 15 * 60 * 1000 });
        return result;
      }
    }
  } catch {
    // Continue to fallback
  }

  // 3. Fallback: Query Page's conversations endpoint (returns participants & senders across all conversations)
  try {
    const convUrl = `https://graph.facebook.com/${apiVersion}/me/conversations?fields=id,participants{id,name},senders{id,name}&limit=50&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(convUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{
          participants?: { data?: Array<{ id?: string; name?: string }> };
          senders?: { data?: Array<{ id?: string; name?: string }> };
        }>;
      };

      if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          const persons = [
            ...(item.participants?.data || []),
            ...(item.senders?.data || []),
          ];
          for (const p of persons) {
            if (p.id && p.name && p.name.trim()) {
              fbProfileCache.set(p.id, {
                profile: { name: p.name.trim(), avatar_url: null },
                expiresAt: Date.now() + 15 * 60 * 1000,
              });
            }
          }
        }
      }

      const match = fbProfileCache.get(psid);
      if (match) {
        return match.profile;
      }
    }
  } catch {
    // Return null on failure
  }

  return null;
}

export async function fetchFacebookProfileName(
  psid: string,
  pageToken: string,
  apiVersion = 'v21.0'
): Promise<string | null> {
  const profile = await fetchFacebookProfile(psid, pageToken, apiVersion);
  return profile?.name || null;
}

/**
 * Fetches the Instagram account display name, username, and avatar for a given IGSID.
 * Supports graph.instagram.com and graph.facebook.com with fallback.
 */
export async function fetchInstagramProfile(
  igsid: string,
  token: string,
  apiVersion = 'v21.0'
): Promise<FetchedProfile | null> {
  if (!igsid || !token) return null;

  // 1. Try graph.instagram.com (for Instagram User Access Tokens) with valid fields
  try {
    const igUrl = `https://graph.instagram.com/${igsid}?fields=id,username,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(igUrl, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = (await res.json()) as {
        name?: string;
        username?: string;
      };
      const name =
        data.name?.trim() || (data.username?.trim() ? `@${data.username.trim()}` : null);
      if (name) {
        return { name, avatar_url: null };
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Try graph.facebook.com (for Page Access Tokens with Instagram permissions)
  try {
    const fbUrl = `https://graph.facebook.com/${apiVersion}/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(fbUrl, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = (await res.json()) as {
        name?: string;
        username?: string;
        profile_pic?: string;
      };
      const name =
        data.name?.trim() || (data.username?.trim() ? `@${data.username.trim()}` : null);
      if (name) {
        return { name, avatar_url: data.profile_pic || null };
      }
    }
  } catch {
    // Ignore error
  }

  return null;
}

export async function fetchInstagramProfileName(
  igsid: string,
  token: string,
  apiVersion = 'v21.0'
): Promise<string | null> {
  const profile = await fetchInstagramProfile(igsid, token, apiVersion);
  return profile?.name || null;
}

export interface MetaMessagingAttachment {
  type?: string;
  payload?: {
    url?: string;
  };
}

export interface MetaMessagingObject {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: MetaMessagingAttachment[];
  };
}

export interface MetaWebhookChangeValue {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: MetaMessagingAttachment[];
  };
  mid?: string;
  text?: string;
  sender_id?: string;
  recipient_id?: string;
  attachments?: MetaMessagingAttachment[];
}

export interface MetaWebhookEntry {
  id?: string;
  time?: number;
  messaging?: MetaMessagingObject[];
  changes?: Array<{
    field?: string;
    value?: MetaWebhookChangeValue;
  }>;
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

export interface WhatsAppProfile {
  name?: string;
}

export interface WhatsAppContact {
  profile?: WhatsAppProfile;
  wa_id?: string;
}

export interface WhatsAppMediaPayload {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppIncomingMessage {
  from?: string;
  id?: string;
  timestamp?: string | number;
  type?: string;
  text?: {
    body?: string;
  };
  image?: WhatsAppMediaPayload;
  audio?: WhatsAppMediaPayload;
  video?: WhatsAppMediaPayload;
  document?: WhatsAppMediaPayload;
  voice?: WhatsAppMediaPayload;
  button?: {
    text?: string;
    payload?: string;
  };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

export interface WhatsAppStatusPayload {
  id?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp?: string | number;
  recipient_id?: string;
  conversation?: {
    id?: string;
    expiration_timestamp?: string | number;
    origin?: { type?: string };
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WhatsAppWebhookValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppIncomingMessage[];
  statuses?: WhatsAppStatusPayload[];
}

export interface WhatsAppWebhookEntry {
  id?: string;
  changes?: Array<{
    field?: string;
    value?: WhatsAppWebhookValue;
  }>;
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: WhatsAppWebhookEntry[];
}

export interface GenericWebhookPayload {
  channel?: string;
  event_id?: string;
  id?: string;
  external_id?: string;
  from?: string;
  thread_id?: string;
  external_thread_id?: string;
  external_message_id?: string;
  content?: string;
  media_url?: string;
  message_type?: string;
  display_name?: string;
  phone?: string;
  sender?: { id?: string; name?: string; phone?: string };
  profile?: { name?: string };
  message?: { id?: string; text?: string; content?: string; media_url?: string; type?: string };
}

/**
 * Validates Meta's X-Hub-Signature-256 (or legacy X-Hub-Signature) header using constant-time HMAC comparison.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const cleanSecret = appSecret.trim();
  const cleanHeader = signatureHeader.trim();
  let algorithm = 'sha256';
  let signatureHex = cleanHeader;

  if (cleanHeader.toLowerCase().startsWith('sha256=')) {
    algorithm = 'sha256';
    signatureHex = cleanHeader.slice(7).trim();
  } else if (cleanHeader.toLowerCase().startsWith('sha1=')) {
    algorithm = 'sha1';
    signatureHex = cleanHeader.slice(5).trim();
  }

  try {
    const hmac = crypto.createHmac(algorithm, cleanSecret);
    const expectedSignature = typeof rawBody === 'string'
      ? hmac.update(rawBody, 'utf-8').digest('hex')
      : hmac.update(rawBody).digest('hex');

    if (signatureHex.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signatureHex.toLowerCase(), 'hex'),
      Buffer.from(expectedSignature.toLowerCase(), 'hex')
    );
  } catch {
    return false;
  }
}

function safeIsoTimestamp(rawTimestamp: unknown): string {
  if (!rawTimestamp) return new Date().toISOString();
  let ms: number;
  if (typeof rawTimestamp === 'number') {
    ms = rawTimestamp < 1e11 ? rawTimestamp * 1000 : rawTimestamp;
  } else if (typeof rawTimestamp === 'string') {
    const parsed = Number(rawTimestamp);
    if (!isNaN(parsed) && rawTimestamp.trim() !== '') {
      ms = parsed < 1e11 ? parsed * 1000 : parsed;
    } else {
      const d = new Date(rawTimestamp);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
  } else {
    return new Date().toISOString();
  }
  const date = new Date(ms);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Normalizes raw incoming webhook payloads into standardized internal events.
 * Supports Meta Messenger payloads (object === 'page'), Meta Instagram payloads (object === 'instagram'), as well as mock/generic payloads.
 */
export function normalizeInboundPayload(
  rawPayload: Record<string, unknown> | null | undefined
): NormalizedInboundEvent[] {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return [];
  }

  // 1. Meta Webhook Payload (object === 'page' || object === 'instagram')
  const metaPayload = rawPayload as MetaWebhookPayload;
  if ((metaPayload.object === 'page' || metaPayload.object === 'instagram') && Array.isArray(metaPayload.entry)) {
    const events: NormalizedInboundEvent[] = [];
    const channel: ChannelType = metaPayload.object === 'instagram' ? 'instagram' : 'messenger';

    const processMessagingObject = (messagingObj: MetaMessagingObject, entryId?: string) => {
      if (!messagingObj.message) return;

      const senderId = messagingObj.sender?.id || 'unknown_sender';
      const recipientId = messagingObj.recipient?.id || entryId || null;
      const mid = messagingObj.message.mid || `mid_${Date.now()}_${Math.random()}`;
      const timestamp = safeIsoTimestamp(messagingObj.timestamp);

      let messageType: MessageType = 'text';
      let content = messagingObj.message.text || '';
      let mediaUrl: string | null = null;
      let externalMediaId: string | null = null;
      let mediaFileName: string | null = null;
      let mediaMimeType: string | null = null;
      const caption: string | null = messagingObj.message.text || null;

      // Check attachments metadata
      if (Array.isArray(messagingObj.message.attachments) && messagingObj.message.attachments.length > 0) {
        const att = messagingObj.message.attachments[0];
        const attType = att.type;
        if (attType === 'image') messageType = 'image';
        else if (attType === 'audio') messageType = 'audio';
        else if (attType === 'video') messageType = 'video';
        else if (attType === 'file') messageType = 'document';

        if (att.payload?.url) {
          mediaUrl = att.payload.url;
        }
        if (att.payload && 'id' in att.payload) {
          externalMediaId = String((att.payload as { id?: string }).id);
        }
        if (att.payload && 'name' in att.payload) {
          mediaFileName = String((att.payload as { name?: string }).name);
        } else if (att.payload && 'title' in att.payload) {
          mediaFileName = String((att.payload as { title?: string }).title);
        }
        if (att.payload && 'mime_type' in att.payload) {
          mediaMimeType = String((att.payload as { mime_type?: string }).mime_type);
        }

        if (!content && attType) {
          content = `[${attType.toUpperCase()} Attachment]`;
        }
      }

      events.push({
        channel,
        eventId: `${channel}_${senderId}_${mid}`,
        externalSenderId: senderId,
        recipientPageId: recipientId,
        senderDisplayName: null, // Profile name fetched via Graph API
        senderPhone: null,
        externalThreadId: senderId, // In Meta IGSID/PSID represents the conversation thread
        externalMessageId: mid,
        messageType,
        content,
        mediaUrl,
        externalMediaId,
        mediaFileName,
        mediaMimeType,
        caption,
        timestamp,
        rawPayload: messagingObj as unknown as Record<string, unknown>,
      });
    };

    for (const entry of metaPayload.entry) {
      // 1A. Standard messaging array
      if (Array.isArray(entry.messaging)) {
        for (const messagingObj of entry.messaging) {
          processMessagingObject(messagingObj, entry.id);
        }
      }

      // 1B. Meta Graph API Webhooks v26.0 / Test Event changes array
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const val = change.value;
          if (!val) continue;

          if (val.message) {
            processMessagingObject(val as MetaMessagingObject, entry.id);
          } else if (val.mid || val.text || val.sender_id) {
            const syntheticMessaging: MetaMessagingObject = {
              sender: { id: val.sender_id || 'unknown_sender' },
              recipient: { id: val.recipient_id || entry.id || undefined },
              timestamp: val.timestamp || entry.time || Date.now(),
              message: {
                mid: val.mid || `mid_${Date.now()}_${Math.random()}`,
                text: val.text || '',
                attachments: val.attachments,
              },
            };
            processMessagingObject(syntheticMessaging, entry.id);
          }
        }
      }
    }

    return events;
  }

  // 2. WhatsApp Cloud API Webhook Payload (object === 'whatsapp_business_account')
  const waPayload = rawPayload as WhatsAppWebhookPayload;
  if (waPayload.object === 'whatsapp_business_account' && Array.isArray(waPayload.entry)) {
    const events: NormalizedInboundEvent[] = [];

    for (const entry of waPayload.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        const val = change.value;
        if (!val) continue;

        const phoneNumberId = val.metadata?.phone_number_id || null;
        const contacts = Array.isArray(val.contacts) ? val.contacts : [];
        const messages = Array.isArray(val.messages) ? val.messages : [];

        // Map contacts by wa_id for fast display_name lookup
        const contactMap = new Map<string, string>();
        for (const contact of contacts) {
          if (contact.wa_id && contact.profile?.name) {
            contactMap.set(contact.wa_id, contact.profile.name.trim());
          }
        }

        for (const msg of messages) {
          const senderWaId = msg.from || contacts[0]?.wa_id || 'unknown_sender';
          const senderPhone = senderWaId;
          const displayName = contactMap.get(senderWaId) || contacts[0]?.profile?.name?.trim() || null;
          const mid = msg.id || `wamid_${Date.now()}_${Math.random()}`;
          const timestamp = safeIsoTimestamp(msg.timestamp);

          let messageType: MessageType = 'text';
          let content = msg.text?.body || '';
          const mediaUrl: string | null = null;
          let externalMediaId: string | null = null;
          let mediaMimeType: string | null = null;
          let mediaFileName: string | null = null;
          let caption: string | null = null;

          if (msg.type === 'image') {
            messageType = 'image';
            externalMediaId = msg.image?.id || null;
            mediaMimeType = msg.image?.mime_type || null;
            caption = msg.image?.caption || null;
            content = msg.image?.caption || content || '[IMAGE Attachment]';
          } else if (msg.type === 'audio' || msg.type === 'voice') {
            messageType = 'audio';
            const audioObj = msg.audio || msg.voice;
            externalMediaId = audioObj?.id || null;
            mediaMimeType = audioObj?.mime_type || null;
            content = content || '[AUDIO Attachment]';
          } else if (msg.type === 'video') {
            messageType = 'video';
            externalMediaId = msg.video?.id || null;
            mediaMimeType = msg.video?.mime_type || null;
            caption = msg.video?.caption || null;
            content = msg.video?.caption || content || '[VIDEO Attachment]';
          } else if (msg.type === 'document') {
            messageType = 'document';
            externalMediaId = msg.document?.id || null;
            mediaMimeType = msg.document?.mime_type || null;
            mediaFileName = msg.document?.filename || null;
            caption = msg.document?.caption || null;
            content = msg.document?.caption || msg.document?.filename || content || '[DOCUMENT Attachment]';
          } else if (msg.type === 'button') {
            content = msg.button?.text || content || '[BUTTON Response]';
          } else if (msg.type === 'interactive') {
            content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || content || '[INTERACTIVE Response]';
          } else if (msg.type && !content) {
            content = `[${msg.type.toUpperCase()} Message]`;
          }

          events.push({
            channel: 'whatsapp',
            eventId: `whatsapp_${senderWaId}_${mid}`,
            externalSenderId: senderWaId,
            recipientPageId: phoneNumberId,
            senderDisplayName: displayName,
            senderPhone: senderPhone,
            externalThreadId: senderWaId,
            externalMessageId: mid,
            messageType,
            content,
            mediaUrl,
            externalMediaId,
            mediaMimeType,
            mediaFileName,
            caption,
            timestamp,
            rawPayload: msg as unknown as Record<string, unknown>,
          });
        }
      }
    }

    return events;
  }

  // 3. Mock / Generic / Phase 4A Payload Format
  const genPayload = rawPayload as GenericWebhookPayload;
  const channel: ChannelType = (genPayload.channel || 'mock') as ChannelType;
  const senderId: string =
    genPayload.sender?.id ||
    genPayload.external_id ||
    genPayload.from ||
    `mock_user_${Date.now()}`;

  const eventId: string =
    genPayload.event_id ||
    genPayload.id ||
    `evt_${channel}_${senderId}_${Date.now()}`;

  const content: string =
    genPayload.message?.text ||
    genPayload.message?.content ||
    genPayload.content ||
    '';

  const mediaUrl: string | null =
    genPayload.message?.media_url ||
    genPayload.media_url ||
    null;

  const messageType: MessageType =
    (genPayload.message?.type || genPayload.message_type || 'text') as MessageType;

  const externalThreadId: string =
    genPayload.thread_id ||
    genPayload.external_thread_id ||
    senderId;

  const externalMessageId: string | null =
    genPayload.message?.id ||
    genPayload.external_message_id ||
    null;

  const senderDisplayName: string | null =
    genPayload.sender?.name ||
    genPayload.display_name ||
    genPayload.profile?.name ||
    null;

  const senderPhone: string | null =
    genPayload.sender?.phone ||
    genPayload.phone ||
    null;

  return [
    {
      channel,
      eventId,
      externalSenderId: senderId,
      senderDisplayName,
      senderPhone,
      externalThreadId,
      externalMessageId,
      messageType,
      content,
      mediaUrl,
      timestamp: new Date().toISOString(),
      rawPayload,
    },
  ];
}
