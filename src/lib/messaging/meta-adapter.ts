// src/lib/messaging/meta-adapter.ts
// Normalization layer for Meta Webhook payloads (Facebook Messenger)
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
  timestamp: string;
  rawPayload: Record<string, unknown>;
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

export interface MetaWebhookEntry {
  id?: string;
  time?: number;
  messaging?: MetaMessagingObject[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
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
 * Validates Meta's X-Hub-Signature-256 header using constant-time HMAC-SHA256 comparison.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const signature = signatureHeader.slice(7);
  const hmac = crypto.createHmac('sha256', appSecret);
  const expectedSignature = hmac.update(rawBody).digest('hex');

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes raw incoming webhook payloads into standardized internal events.
 * Supports Meta Messenger payloads (object === 'page') as well as mock/generic payloads.
 */
export function normalizeInboundPayload(
  rawPayload: Record<string, unknown> | null | undefined
): NormalizedInboundEvent[] {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return [];
  }

  // 1. Meta Messenger Webhook Payload (object === 'page')
  const metaPayload = rawPayload as MetaWebhookPayload;
  if (metaPayload.object === 'page' && Array.isArray(metaPayload.entry)) {
    const events: NormalizedInboundEvent[] = [];

    for (const entry of metaPayload.entry) {
      if (Array.isArray(entry.messaging)) {
        for (const messagingObj of entry.messaging) {
          // Process message objects
          if (messagingObj.message) {
            const senderId = messagingObj.sender?.id || 'unknown_sender';
            const recipientId = messagingObj.recipient?.id || entry.id || null;
            const mid = messagingObj.message.mid || `mid_${Date.now()}_${Math.random()}`;
            const timestampMs = messagingObj.timestamp || entry.time || Date.now();
            const timestamp = new Date(timestampMs).toISOString();

            let messageType: MessageType = 'text';
            let content = messagingObj.message.text || '';
            let mediaUrl: string | null = null;

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
              if (!content && attType) {
                content = `[${attType.toUpperCase()} Attachment]`;
              }
            }

            events.push({
              channel: 'messenger',
              eventId: `messenger_${senderId}_${mid}`,
              externalSenderId: senderId,
              recipientPageId: recipientId,
              senderDisplayName: null, // PSID does not provide profile name directly without Graph API lookup
              senderPhone: null,
              externalThreadId: senderId, // In Messenger PSID represents the conversation thread
              externalMessageId: mid,
              messageType,
              content,
              mediaUrl,
              timestamp,
              rawPayload: messagingObj as unknown as Record<string, unknown>,
            });
          }
        }
      }
    }

    return events;
  }

  // 2. Mock / Generic / Phase 4A Payload Format
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
