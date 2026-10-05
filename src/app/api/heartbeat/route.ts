// src/app/api/heartbeat/route.ts
// Phase 3: Employee availability heartbeat endpoint.
// Sales employees send periodic heartbeats to indicate they are online
// and available to receive new leads.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

export async function POST() {
  try {
    // 1. Authenticate the request
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Find the employee record
    const admin = createAdminClient();
    const { data: employee, error: empError } = await admin
      .from('employees')
      .select('id, is_active')
      .eq('auth_user_id', user.id)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    if (!employee.is_active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
    }

    // 3. Update heartbeat and online status
    const { error: updateError } = await admin
      .from('employees')
      .update({
        is_online: true,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', employee.id);

    if (updateError) {
      console.error('[Heartbeat] Failed to update:', updateError.message);
      return NextResponse.json({ error: 'Failed to update heartbeat' }, { status: 500 });
    }

    // 4. Drain pending unassigned backlog leads
    try {
      const { data: drainedCount } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });
      if (typeof drainedCount === 'number' && drainedCount > 0) {
        await writeAuditLog({
          actor_id: employee.id,
          action: 'inbox.pending_queue_drained',
          module: 'crm',
          entity_type: 'conversation',
          new_value: { count: drainedCount, triggered_by_employee_id: employee.id },
        });
      }
    } catch (drainErr) {
      console.warn('[Heartbeat] Backlog processing warning:', drainErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Heartbeat] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
