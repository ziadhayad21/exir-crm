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
 * Safely parse a JSON value, returning null on failure.
 */
export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

