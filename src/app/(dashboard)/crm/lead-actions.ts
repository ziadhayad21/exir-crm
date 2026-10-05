// src/app/(dashboard)/crm/lead-actions.ts
// Phase 3: Lead management server actions.
// Handles lead creation with automatic assignment, status updates,
// manual reassignment, and today's lead count queries.
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import {
  createLeadSchema,
  updateLeadStatusSchema,
  reassignLeadSchema,
} from '@/lib/validations/crm';
import type {
  ActionResult,
  Lead,
  LeadWithAssignee,
} from '@/types';
import { revalidatePath } from 'next/cache';

// ═══════════════════════════════════════════════════════════════
// READ OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all leads visible to the current user (respects RLS).
 */
export async function getLeads(): Promise<LeadWithAssignee[]> {
  await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);
  const admin = createAdminClient();
  const supabase = await createClient();

  // Use supabase (session client) for RLS-filtered lead IDs
  const { data: visibleLeads, error: listError } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (listError || !visibleLeads || visibleLeads.length === 0) {
    return [];
  }

  // Enrich with assignee info using admin client
  const assigneeIds = [
    ...new Set(
      visibleLeads
        .map((l) => l.assigned_to)
        .filter((id): id is string => !!id)
    ),
  ];

  const employeeMap: Record<string, { id: string; full_name: string; email: string }> = {};

  if (assigneeIds.length > 0) {
    const { data: employees } = await admin
      .from('employees')
      .select('id, full_name, email')
      .in('id', assigneeIds);

    if (employees) {
      for (const emp of employees) {
        employeeMap[emp.id] = emp;
      }
    }
  }

  return visibleLeads.map((lead) => ({
    ...(lead as Lead),
    assigned_to_employee: lead.assigned_to
      ? (employeeMap[lead.assigned_to] as LeadWithAssignee['assigned_to_employee']) ?? null
      : null,
  }));
}

/**
 * Get a single lead by ID.
 */
export async function getLeadById(id: string): Promise<LeadWithAssignee | null> {
  await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !lead) return null;

  // Enrich with assignee info
  let assignedEmployee = null;
  if (lead.assigned_to) {
    const admin = createAdminClient();
    const { data: emp } = await admin
      .from('employees')
      .select('id, full_name, email')
      .eq('id', lead.assigned_to)
      .single();
    assignedEmployee = emp ?? null;
  }

  return {
    ...(lead as Lead),
    assigned_to_employee: assignedEmployee as LeadWithAssignee['assigned_to_employee'],
  };
}

/**
 * Get today's lead assignment count for the current employee.
 */
export async function getTodayLeadCount(): Promise<number> {
  const currentUser = await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);
  const admin = createAdminClient();

  const { count, error } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', currentUser.employee.id)
    .gte('assigned_at', getTodayStart());

  if (error) {
    console.error('[Leads] Error getting today count:', error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Get today's lead counts for all Sales employees (admin view).
 */
export async function getTodayLeadCountsAll(): Promise<{ employee_id: string; employee_name: string; count: number }[]> {
  await requirePermission('crm.leads.read_all');
  const admin = createAdminClient();

  // Get all Sales employees
  const { data: salesEmployees } = await admin
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true);

  if (!salesEmployees || salesEmployees.length === 0) return [];

  // Get today's lead counts
  const { data: leads } = await admin
    .from('leads')
    .select('assigned_to')
    .gte('assigned_at', getTodayStart())
    .not('assigned_to', 'is', null);

  const countMap: Record<string, number> = {};
  for (const lead of leads ?? []) {
    if (lead.assigned_to) {
      countMap[lead.assigned_to] = (countMap[lead.assigned_to] ?? 0) + 1;
    }
  }

  return salesEmployees.map((emp) => ({
    employee_id: emp.id,
    employee_name: emp.full_name,
    count: countMap[emp.id] ?? 0,
  }));
}

// ═══════════════════════════════════════════════════════════════
// WRITE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new lead and automatically assign to an eligible Sales employee.
 * The assignment is done atomically via the PostgreSQL function.
 */
export async function createLead(formData: FormData): Promise<ActionResult<Lead>> {
  const currentUser = await requirePermission('crm.leads.write');

  const raw = {
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    source: formData.get('source') || 'manual',
    notes: formData.get('notes'),
  };

  const parsed = createLeadSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // 1. Insert the lead (unassigned initially)
  const { data: lead, error: insertError } = await admin
    .from('leads')
    .insert({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      source: parsed.data.source,
      notes: parsed.data.notes || null,
      status: 'new',
      assignment_source: 'unassigned',
    })
    .select('*')
    .single();

  if (insertError || !lead) {
    return { success: false, error: insertError?.message || 'Failed to create lead' };
  }

  // 2. Atomically assign to an eligible Sales employee via PG function
  const { data: assignedEmployeeId, error: assignError } = await admin.rpc('assign_lead_to_sales', {
    p_lead_id: lead.id,
    p_business_tz: 'Africa/Cairo',
  });

  if (assignError) {
    console.error('[Leads] Assignment RPC error:', assignError.message);
    // Lead is still created but unassigned — this is acceptable behavior
  }

  // 3. Fetch the final lead state
  const { data: finalLead } = await admin
    .from('leads')
    .select('*')
    .eq('id', lead.id)
    .single();

  // 4. Audit log
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'lead.created',
    module: 'crm',
    entity_type: 'lead',
    entity_id: lead.id,
    new_value: {
      ...finalLead,
      assigned_employee_id: assignedEmployeeId || null,
      assignment_method: assignedEmployeeId ? 'automatic' : 'unassigned',
    },
  });

  revalidatePath('/crm/leads');
  revalidatePath('/dashboard');

  return { success: true, data: (finalLead ?? lead) as Lead };
}

/**
 * Update a lead's status.
 */
export async function updateLeadStatus(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.leads.write');

  const raw = {
    lead_id: formData.get('lead_id'),
    status: formData.get('status'),
  };

  const parsed = updateLeadStatusSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Fetch existing lead
  const { data: existing, error: fetchError } = await admin
    .from('leads')
    .select('*')
    .eq('id', parsed.data.lead_id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Lead not found.' };
  }

  // Ownership check
  const isOwner = existing.assigned_to === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.leads.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to update this lead.' };
  }

  // If transitioning to converted, perform conversion to Customer + Deal
  let customerId = existing.converted_to_customer_id;
  let dealId = existing.converted_to_deal_id;

  if (parsed.data.status === 'converted') {
    // If not already converted to a deal, create/link Customer and Deal
    if (!dealId) {
      // 1. Link or create Customer
      if (!customerId) {
        // Check if customer with same email or phone exists
        const checks: string[] = [];
        if (existing.email) checks.push(`email.eq.${existing.email}`);
        if (existing.phone) checks.push(`phone.eq.${existing.phone}`);

        if (checks.length > 0) {
          const { data: duplicates } = await admin
            .from('customers')
            .select('id')
            .is('deleted_at', null)
            .or(checks.join(','));

          if (duplicates && duplicates.length > 0) {
            customerId = duplicates[0].id;
          }
        }

        // If still no customer, create one
        if (!customerId) {
          const { data: newCustomer, error: custErr } = await admin
            .from('customers')
            .insert({
              full_name: existing.full_name,
              phone: existing.phone || null,
              email: existing.email || null,
              source: existing.source || 'manual',
              notes: existing.notes || null,
              created_by: existing.assigned_to || currentUser.employee.id,
            })
            .select('id')
            .single();

          if (custErr || !newCustomer) {
            return { success: false, error: custErr?.message || 'Failed to create customer during conversion' };
          }
          customerId = newCustomer.id;
        }
      }

      // 2. Create Deal in Phase 2 pipeline with stage = 'new'
      const { data: newDealId, error: dealErr } = await admin.rpc('crm_create_deal', {
        p_title: `Deal - ${existing.full_name}`,
        p_customer_id: customerId,
        p_assigned_to: existing.assigned_to || currentUser.employee.id,
        p_total_amount: null,
        p_expected_close_date: null,
        p_notes: existing.notes ? `Converted from Lead: ${existing.notes}` : 'Converted from Lead',
        p_created_by: currentUser.employee.id,
      });

      if (dealErr || !newDealId) {
        return { success: false, error: dealErr?.message || 'Failed to create deal during conversion' };
      }
      dealId = newDealId;
    }
  }

  // Update status & conversion references
  const { error: updateError } = await admin
    .from('leads')
    .update({
      status: parsed.data.status,
      converted_to_customer_id: customerId,
      converted_to_deal_id: dealId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.lead_id);

  if (updateError) {
    return { success: false, error: updateError.message || 'Failed to update lead status' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: parsed.data.status === 'converted' ? 'lead.converted' : 'lead.status_changed',
    module: 'crm',
    entity_type: 'lead',
    entity_id: parsed.data.lead_id,
    old_value: { status: existing.status },
    new_value: {
      status: parsed.data.status,
      customer_id: customerId,
      deal_id: dealId,
    },
  });

  revalidatePath('/crm/leads');
  revalidatePath('/crm/customers');
  revalidatePath('/crm/deals');
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Explicit lead conversion action: converts lead to Customer + Deal.
 * Idempotent: retrying will not create duplicate Deal.
 */
export async function convertLead(formData: FormData): Promise<ActionResult<{ customer_id: string; deal_id: string }>> {
  const leadId = formData.get('lead_id') as string;
  if (!leadId) {
    return { success: false, error: 'Lead ID is required' };
  }

  const updateFormData = new FormData();
  updateFormData.set('lead_id', leadId);
  updateFormData.set('status', 'converted');

  const res = await updateLeadStatus(updateFormData);
  if (!res.success) {
    return { success: false, error: res.error };
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from('leads')
    .select('converted_to_customer_id, converted_to_deal_id')
    .eq('id', leadId)
    .single();

  return {
    success: true,
    data: {
      customer_id: lead?.converted_to_customer_id ?? '',
      deal_id: lead?.converted_to_deal_id ?? '',
    },
  };
}

/**
 * Manually reassign a lead to a different employee.
 * Admin/authorized users only.
 */
export async function reassignLead(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.leads.read_all');

  const raw = {
    lead_id: formData.get('lead_id'),
    assigned_to: formData.get('assigned_to'),
  };

  const parsed = reassignLeadSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Fetch existing lead
  const { data: existing, error: fetchError } = await admin
    .from('leads')
    .select('assigned_to')
    .eq('id', parsed.data.lead_id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Lead not found.' };
  }

  // Validate target employee exists and is active
  const { data: target, error: targetError } = await admin
    .from('employees')
    .select('id, is_active')
    .eq('id', parsed.data.assigned_to)
    .single();

  if (targetError || !target) {
    return { success: false, error: 'Target employee not found.' };
  }
  if (!target.is_active) {
    return { success: false, error: 'Cannot assign lead to an inactive employee.' };
  }

  // Update assignment
  const { error: updateError } = await admin
    .from('leads')
    .update({
      assigned_to: parsed.data.assigned_to,
      assigned_at: new Date().toISOString(),
      assignment_source: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.lead_id);

  if (updateError) {
    return { success: false, error: updateError.message || 'Failed to reassign lead' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'lead.reassigned',
    module: 'crm',
    entity_type: 'lead',
    entity_id: parsed.data.lead_id,
    old_value: { assigned_to: existing.assigned_to },
    new_value: { assigned_to: parsed.data.assigned_to, assignment_source: 'manual' },
  });

  revalidatePath('/crm/leads');
  return { success: true };
}

/**
 * Set the current Sales employee's online/offline availability.
 */
export async function setAvailability(formData: FormData): Promise<ActionResult> {
  const currentUser = await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);

  const isOnline = formData.get('is_online') === 'true';
  const admin = createAdminClient();

  const { error } = await admin
    .from('employees')
    .update({
      is_online: isOnline,
      last_heartbeat: isOnline ? new Date().toISOString() : null,
    })
    .eq('id', currentUser.employee.id);

  if (error) {
    return { success: false, error: 'Failed to update availability' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: isOnline ? 'employee.went_online' : 'employee.went_offline',
    module: 'crm',
    entity_type: 'employee',
    entity_id: currentUser.employee.id,
  });

  revalidatePath('/crm/leads');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the start of today in Africa/Cairo timezone as ISO string.
 */
function getTodayStart(): string {
  // Calculate today's start in Africa/Cairo (UTC+2, or UTC+3 in summer)
  const now = new Date();
  // Use a formatter to get the Cairo date
  const cairoDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  // Create a Date for midnight in Cairo
  return `${cairoDateStr}T00:00:00+02:00`;
}
