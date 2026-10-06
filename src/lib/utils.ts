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
 * Priority: identity display_name -> customer full_name -> lead full_name -> phone -> external_id -> channel fallback.
 */
export interface DisplayNameInputs {
  channel?: string | null;
  channel_identity?: { display_name?: string | null; phone?: string | null; external_id?: string | null } | null;
  customer?: { full_name?: string | null } | null;
  lead?: { full_name?: string | null } | null;
}

export function resolveConversationDisplayName(inputs: DisplayNameInputs): string {
  const { channel, channel_identity, customer, lead } = inputs;
  if (channel_identity?.display_name && channel_identity.display_name.trim() && channel_identity.display_name.trim() !== 'Contact') {
    return channel_identity.display_name.trim();
  }
  if (customer?.full_name && customer.full_name.trim()) {
    return customer.full_name.trim();
  }
  if (lead?.full_name && lead.full_name.trim()) {
    return lead.full_name.trim();
  }
  if (channel_identity?.phone && channel_identity.phone.trim()) {
    return channel_identity.phone.trim();
  }
  if (channel_identity?.external_id && channel_identity.external_id.trim() && channel_identity.external_id !== 'Unknown') {
    if (channel === 'messenger') return 'Facebook User';
    if (channel === 'instagram') return 'Instagram User';
    if (channel === 'whatsapp') return 'WhatsApp User';
    return channel_identity.external_id.trim();
  }
  if (channel === 'messenger') return 'Facebook User';
  if (channel === 'instagram') return 'Instagram User';
  if (channel === 'whatsapp') return 'WhatsApp User';
  return 'Contact';
}

