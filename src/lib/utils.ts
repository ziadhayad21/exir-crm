// src/lib/utils.ts
// General utility functions

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx.
 * Handles conflicts properly (e.g., `cn('px-2', 'px-4')` → 'px-4').
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string for display.
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a datetime string for display.
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format currency amount for EGP.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EGP`;
}

/**
 * Standard display-name resolver across Messenger, Instagram, and WhatsApp.
 * Priority: Real identity display_name -> Real customer full_name -> Real lead full_name -> Phone -> Any display_name -> External ID -> Channel fallback.
 */
export interface DisplayNameInputs {
  channel?: string | null;
  channel_identity?: { display_name?: string | null; phone?: string | null; external_id?: string | null } | null;
  customer?: { full_name?: string | null } | null;
  lead?: { full_name?: string | null } | null;
}

const GENERIC_NAMES = new Set([
  'facebook user',
  'instagram user',
  'whatsapp user',
  'whatsapp contact',
  'contact',
  'unknown',
  'unknown customer',
  'unknown user',
]);

export function isGenericDisplayName(name?: string | null): boolean {
  if (!name || !name.trim()) return true;
  return GENERIC_NAMES.has(name.trim().toLowerCase());
}

export function resolveConversationDisplayName(inputs: DisplayNameInputs): string {
  const { channel, channel_identity, customer, lead } = inputs;

  const identName = channel_identity?.display_name?.trim();
  const custName = customer?.full_name?.trim();
  const leadName = lead?.full_name?.trim();
  const phone = channel_identity?.phone?.trim();
  const extId = channel_identity?.external_id?.trim();

  // 1. If identity has a REAL name (not generic placeholder)
  if (identName && !isGenericDisplayName(identName)) {
    return identName;
  }

  // 2. If customer has a REAL name (e.g. linked CRM customer)
  if (custName && !isGenericDisplayName(custName)) {
    return custName;
  }

  // 3. If lead has a REAL name (e.g. edited by sales agent)
  if (leadName && !isGenericDisplayName(leadName)) {
    return leadName;
  }

  // 4. If phone exists
  if (phone) {
    return phone;
  }

  // 5. If customer / lead has any non-empty name
  if (custName) return custName;
  if (leadName) return leadName;

  // 6. If identity has any non-empty display name
  if (identName) return identName;

  // 7. Channel specific external ID or fallback
  if (extId && extId !== 'Unknown') {
    if (channel === 'whatsapp') return extId.startsWith('+') ? extId : `+${extId}`;
    if (channel === 'instagram') return extId.startsWith('@') ? extId : `@${extId}`;
    if (channel === 'messenger') return `Facebook User (${extId.slice(-4)})`;
    return extId;
  }

  if (channel === 'messenger') return 'Facebook User';
  if (channel === 'instagram') return 'Instagram User';
  if (channel === 'whatsapp') return 'WhatsApp User';
  return 'Contact';
}

import type { Message } from '@/types';

/**
 * Safely merges cached/optimistic/realtime messages with incoming server messages.
 * - Deduplicates by stable `id` and `external_message_id`.
 * - Preserves optimistic pending messages (`temp_...` or `status === 'sending'`).
 * - Preserves realtime incoming messages that arrived during background fetch.
 * - Preserves enriched attachments / signed URLs.
 * - Sorts strictly chronologically by timestamp.
 */
export function mergeMessages(cachedMsgs: Message[], serverMsgs: Message[]): Message[] {
  if (!cachedMsgs || cachedMsgs.length === 0) return serverMsgs || [];
  if (!serverMsgs || serverMsgs.length === 0) return cachedMsgs || [];

  const map = new Map<string, Message>();
  const extMap = new Map<string, string>(); // external_message_id -> id

  // 1. Populate map with server messages first (authoritative persisted state)
  for (const msg of serverMsgs) {
    if (!msg || !msg.id) continue;
    map.set(msg.id, msg);
    if (msg.external_message_id) {
      extMap.set(msg.external_message_id, msg.id);
    }
  }

  // 2. Merge cached/optimistic/realtime messages
  for (const msg of cachedMsgs) {
    if (!msg || !msg.id) continue;
    const isTemp = msg.id.startsWith('temp_') || msg.status === 'sending';
    const existingById = map.get(msg.id);
    const existingByExtId = msg.external_message_id ? extMap.get(msg.external_message_id) : null;

    if (isTemp) {
      // If server already returned a message matching external_message_id or same id, skip temp
      if (existingByExtId || (existingById && existingById.status !== 'sending')) {
        continue;
      }
      map.set(msg.id, msg);
    } else if (!existingById && !existingByExtId) {
      // Realtime message that arrived while server query was in flight
      map.set(msg.id, msg);
      if (msg.external_message_id) {
        extMap.set(msg.external_message_id, msg.id);
      }
    } else if (existingById) {
      // Merge attachments / signed URLs if server response missing signed_url
      const mergedAtts =
        msg.attachments && msg.attachments.length > 0
          ? msg.attachments.map((cachedAtt) => {
              const serverAtt = existingById.attachments?.find((sa) => sa.id === cachedAtt.id);
              return {
                ...(serverAtt || cachedAtt),
                signed_url: serverAtt?.signed_url || cachedAtt.signed_url,
              };
            })
          : existingById.attachments;

      map.set(msg.id, {
        ...existingById,
        attachments: mergedAtts,
        media_url: existingById.media_url || msg.media_url,
      });
    }
  }

  // 3. Sort chronologically by created_at / sent_at
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.created_at || a.sent_at || 0).getTime();
    const timeB = new Date(b.created_at || b.sent_at || 0).getTime();
    return timeA - timeB;
  });
}


