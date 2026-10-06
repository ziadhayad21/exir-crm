// src/lib/audit/index.ts
// Server-side audit logging utilities.
// All audit log writes go through the admin client to bypass RLS.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditLogEntry {
  actor_id: string | null;
  action: string;
  module: string;
  entity_type?: string;
  entity_id?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write an audit log entry.
 * Uses the admin client so that RLS (append-only) restrictions
 * do not block the insert.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_logs').insert({
      actor_id: entry.actor_id,
      action: entry.action,
      module: entry.module,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      metadata: entry.metadata ?? null,
    });

    if (error) {
      console.error('[Audit] Failed to write audit log:', error.message);
    }
  } catch (err) {
    // Audit logging should never break the main operation
    console.error('[Audit] Unexpected error:', err);
  }
}
