// src/lib/excel/index.ts
// Local Excel utility using SheetJS (xlsx) for ERP reports import & export.
// All processing is strictly local / server-side. No external services.

import * as XLSX from 'xlsx';
import crypto from 'crypto';

export interface ColumnWidth {
  wch: number;
}

/**
 * Builds an Excel workbook (.xlsx) from JSON rows and returns it as a base64 string.
 */
export function buildExcelBase64(
  sheetName: string,
  rows: Record<string, unknown>[],
  colWidths?: ColumnWidth[]
): string {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  if (colWidths && colWidths.length > 0) {
    ws['!cols'] = colWidths;
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel limit is 31 chars for sheet name
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

/**
 * Parses an Excel file from a base64 string and returns the first sheet rows as objects.
 * Cleans string keys by trimming and lowercasing for flexible column mapping.
 */
export function parseExcelFromBase64<T = Record<string, unknown>>(base64Data: string): T[] {
  try {
    if (!base64Data || typeof base64Data !== 'string') return [];
    // Strip data URL header if present (e.g. data:...;base64,)
    const cleanBase64 = (base64Data.includes(',') ? base64Data.split(',')[1] : base64Data).trim();
    if (!cleanBase64) return [];

    const wb = XLSX.read(cleanBase64, { type: 'base64', cellDates: true });
    if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return [];

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];

    // Parse rows as raw objects
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false, // Convert dates/numbers to clean formatted strings where applicable
    });

    return (rawRows ?? []) as T[];
  } catch (err: unknown) {
    console.error('[Excel] Error parsing base64 workbook:', err);
    return [];
  }
}

/**
 * Normalizes an object's keys to trim whitespace, lowercase, and remove special characters.
 */
export function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '_');
    normalized[cleanKey] = val;
  }
  return normalized;
}

/**
 * Normalizes phone numbers to produce multiple match keys:
 * - full trimmed string (lowercase)
 * - pure digits
 * - last 9 and 10 digits (Egyptian phone standard: 010... vs +2010... vs 2010...)
 */
export function getPhoneMatchKeys(phone?: string | null): string[] {
  if (!phone) return [];
  const raw = phone.toString().trim().toLowerCase();
  const digits = raw.replace(/\D/g, '');
  const keys = new Set<string>();
  if (raw) keys.add(raw);
  if (digits) {
    keys.add(digits);
    // Egyptian phone formats:
    // e.g. '201012345678' (12 digits with 20)
    // e.g. '01012345678' (11 digits with 0)
    // e.g. '1012345678' (10 digits without leading zero from Excel)
    if (digits.startsWith('20') && digits.length === 12) {
      const local = '0' + digits.slice(2);
      const noZero = digits.slice(2);
      keys.add(local);
      keys.add(noZero);
      keys.add('+' + digits);
    } else if (digits.startsWith('01') && digits.length === 11) {
      const intl = '20' + digits.slice(1);
      const noZero = digits.slice(1);
      keys.add(intl);
      keys.add('+' + intl);
      keys.add(noZero);
    } else if (digits.startsWith('1') && digits.length === 10) {
      // Excel stripped leading zero
      const local = '0' + digits;
      const intl = '20' + digits;
      keys.add(local);
      keys.add(intl);
      keys.add('+' + intl);
    } else {
      if (digits.length >= 9) keys.add(digits.slice(-9));
      if (digits.length >= 10) keys.add(digits.slice(-10));
    }
  }
  return Array.from(keys);
}

/**
 * Normalizes an arbitrary ID (numeric, string, or UUID) into a valid RFC-4122 UUID.
 * - If already a standard UUID (case-insensitive), returns lowercase UUID string.
 * - If any non-empty string or number (e.g. '1', '100', 'LD-01', 'cust-20'),
 *   deterministically hashes it using MD5 to produce a constant, valid UUID.
 *   This ensures '1' always maps to the same UUID in PostgreSQL across exports/imports.
 * - If null / undefined / empty string, returns null (so a new random UUID can be generated).
 */
export function normalizeToUuid(id?: string | number | null): string | null {
  if (id === null || id === undefined) return null;
  const str = String(id).trim();
  if (!str) return null;

  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (uuidRegex.test(str)) {
    return str.toLowerCase();
  }

  // Deterministically hash to 32 hex chars and format as 8-4-4-4-12 UUID
  const hex = crypto.createHash('md5').update(`el-exir-erp-seed:${str.toLowerCase()}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
