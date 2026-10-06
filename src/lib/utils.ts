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


