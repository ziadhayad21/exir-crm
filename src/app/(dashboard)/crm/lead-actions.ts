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
  Employee,
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

  // Get only eligible Sales employees (Admin is strictly excluded)
  const { data: salesEmployees } = await admin.rpc('get_eligible_sales_employees');

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

  return (salesEmployees as { id: string; full_name: string }[]).map((emp) => ({
    employee_id: emp.id,
    employee_name: emp.full_name,
    count: countMap[emp.id] ?? 0,
  }));
}

/**
 * Get all active eligible Sales employees (Admin excluded).
 */
export async function getEligibleSalesEmployees(): Promise<Employee[]> {
  await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);
  const admin = createAdminClient();

  const { data: salesEmployees, error } = await admin.rpc('get_eligible_sales_employees');
  if (error || !salesEmployees) return [];
  return salesEmployees as Employee[];
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
    customer_id: formData.get('customer_id') || undefined,
    create_new_customer: formData.get('create_new_customer') === 'true',
  };

  const parsed = createLeadSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  let linkedCustomerId: string | null = parsed.data.customer_id || null;

  // Handle + Create New Customer flow if requested
  if (parsed.data.create_new_customer && !linkedCustomerId) {
    // 1. Soft-deduplication check: avoid duplicate customer if phone or email already exists
    const checks: string[] = [];
    if (parsed.data.phone) checks.push(`phone.eq.${parsed.data.phone}`);
    if (parsed.data.email) checks.push(`email.eq.${parsed.data.email}`);

    if (checks.length > 0) {
      const { data: existingCust } = await admin
        .from('customers')
        .select('id')
        .is('deleted_at', null)
        .or(checks.join(','))
        .limit(1);

      if (existingCust && existingCust.length > 0) {
        linkedCustomerId = existingCust[0].id;
      }
    }

    // 2. If no existing customer, create new customer record
    if (!linkedCustomerId) {
      const { data: newCust, error: custErr } = await admin
        .from('customers')
        .insert({
          full_name: parsed.data.full_name,
          phone: parsed.data.phone || null,
          email: parsed.data.email || null,
          source: parsed.data.source || 'manual',
          notes: parsed.data.notes || null,
          created_by: currentUser.employee.id,
        })
        .select('id')
        .single();

      if (custErr) {
        console.warn('[Leads] Warning creating customer during lead creation:', custErr.message);
      } else if (newCust) {
        linkedCustomerId = newCust.id;
      }
    }
  }

  // 1. Insert the lead (unassigned initially, linked to customer if specified)
  const { data: lead, error: insertError } = await admin
    .from('leads')
    .insert({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      source: parsed.data.source,
      notes: parsed.data.notes || null,
      customer_id: linkedCustomerId,
      converted_to_customer_id: linkedCustomerId,
      status: 'in_progress',
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
  revalidatePath('/crm/customers');
  revalidatePath('/dashboard');

  return { success: true, data: (finalLead ?? lead) as Lead };
}

/**
 * Update a lead's status using the authoritative DB operation.
 */
export async function updateLeadStatus(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.leads.write');

  const raw = {
    lead_id: formData.get('lead_id'),
    status: formData.get('status'),
    follow_up_at: formData.get('follow_up_at') || null,
    notes: formData.get('notes') || null,
    service_name: formData.get('service_name') || null,
    total_amount: formData.get('total_amount') || null,
    paid_amount: formData.get('paid_amount') || null,
    remaining_amount: formData.get('remaining_amount') || null,
    service_type: formData.get('service_type') || null,
    lost_reason: formData.get('lost_reason') || null,
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

  // If transitioning to won, link or create Customer contact directly (NO Deals)
  let customerId = existing.customer_id || existing.converted_to_customer_id;

  if (parsed.data.status === 'won') {
    if (!customerId) {
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

      if (!customerId) {
        const validCustomerSources = [
          'manual',
          'referral',
          'walk_in',
          'website',
          'social_media',
          'whatsapp',
          'phone_call',
          'instagram',
          'messenger',
          'other',
        ];
        let customerSource = existing.source || 'manual';
        if (!validCustomerSources.includes(customerSource)) {
          customerSource = 'other';
        }

        const { data: newCustomer, error: custErr } = await admin
          .from('customers')
          .insert({
            full_name: existing.full_name,
            phone: existing.phone || null,
            email: existing.email || null,
            source: customerSource,
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
  }

  // Authoritative status change via PG function
  const { error: rpcError } = await admin.rpc('change_lead_status', {
    p_lead_id: parsed.data.lead_id,
    p_new_status: parsed.data.status,
    p_changed_by: currentUser.employee.id,
    p_follow_up_at: parsed.data.follow_up_at || null,
    p_notes: parsed.data.notes || null,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message || 'Failed to update lead status' };
  }

  // Prepare structured commercial updates directly under the Lead
  const leadUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (customerId) {
    leadUpdates.customer_id = customerId;
    leadUpdates.converted_to_customer_id = customerId;
  }

  if (parsed.data.status === 'won') {
    const total = parsed.data.total_amount !== undefined && parsed.data.total_amount !== null
      ? Number(parsed.data.total_amount)
      : existing.total_amount;
    const paid = parsed.data.paid_amount !== undefined && parsed.data.paid_amount !== null
      ? Number(parsed.data.paid_amount)
      : (existing.paid_amount ?? 0);
    const remaining = total !== null && total !== undefined
      ? Math.max(0, total - (paid ?? 0))
      : null;

    if (parsed.data.service_name) {
      leadUpdates.service_name = parsed.data.service_name;
    }
    leadUpdates.total_amount = total;
    leadUpdates.paid_amount = paid;
    leadUpdates.remaining_amount = remaining;
    leadUpdates.currency = existing.currency || 'EGP';
  } else if (parsed.data.status === 'lose') {
    if (parsed.data.service_name) {
      leadUpdates.service_name = parsed.data.service_name;
      leadUpdates.service_type = parsed.data.service_name;
    } else if (parsed.data.service_type) {
      leadUpdates.service_type = parsed.data.service_type;
      leadUpdates.service_name = parsed.data.service_type;
    }
    if (parsed.data.lost_reason || parsed.data.notes) {
      leadUpdates.lost_reason = parsed.data.lost_reason || parsed.data.notes;
    }
  }

  // Save structured commercial details under the lead
  const { error: updateErr } = await admin
    .from('leads')
    .update(leadUpdates)
    .eq('id', parsed.data.lead_id);

  if (updateErr) {
    console.warn('[Leads] Warning updating structured lead details:', updateErr);
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: parsed.data.status === 'won' ? 'lead.won' : 'lead.status_changed',
    module: 'crm',
    entity_type: 'lead',
    entity_id: parsed.data.lead_id,
    old_value: { status: existing.status },
    new_value: {
      status: parsed.data.status,
      follow_up_at: parsed.data.follow_up_at || null,
      customer_id: customerId,
      service_name: leadUpdates.service_name || null,
      total_amount: leadUpdates.total_amount || null,
      paid_amount: leadUpdates.paid_amount || null,
      remaining_amount: leadUpdates.remaining_amount || null,
      service_type: leadUpdates.service_type || null,
      lost_reason: leadUpdates.lost_reason || null,
    },
  });

  // Attempt to claim up to 2 transferable backlog leads if employee has finished active workload
  if (parsed.data.status !== 'in_progress') {
    try {
      await admin.rpc('claim_transferable_lead_batch', {
        p_employee_id: currentUser.employee.id,
        p_batch_limit: 2,
        p_business_tz: 'Africa/Cairo',
      });
    } catch (claimErr) {
      console.warn('[Leads] Auto-claim transferable backlog warning:', claimErr);
    }
  }

  // Mark existing follow_up notifications as read if lead moved to won, lose, or in_progress
  if (parsed.data.status !== 'follow_up') {
    try {
      await admin
        .from('notifications')
        .update({ is_read: true })
        .eq('entity_id', parsed.data.lead_id)
        .eq('type', 'follow_up_reminder');
    } catch (notifErr) {
      console.warn('[Leads] Auto-mark follow-up notification as read error:', notifErr);
    }
  }

  revalidatePath('/crm/leads');
  revalidatePath('/crm/customers');
  revalidatePath('/crm/inbox');
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Explicit lead conversion action: converts lead to Customer (Sales Won).
 * Idempotent and does NOT create Deals.
 */
export async function convertLead(formData: FormData): Promise<ActionResult<{ customer_id: string; lead_id: string }>> {
  const leadId = formData.get('lead_id') as string;
  if (!leadId) {
    return { success: false, error: 'Lead ID is required' };
  }

  const updateFormData = new FormData();
  updateFormData.set('lead_id', leadId);
  updateFormData.set('status', 'won');
  if (formData.get('service_name')) updateFormData.set('service_name', formData.get('service_name') as string);
  if (formData.get('total_amount')) updateFormData.set('total_amount', formData.get('total_amount') as string);
  if (formData.get('paid_amount')) updateFormData.set('paid_amount', formData.get('paid_amount') as string);

  const res = await updateLeadStatus(updateFormData);
  if (!res.success) {
    return { success: false, error: res.error };
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from('leads')
    .select('customer_id, converted_to_customer_id')
    .eq('id', leadId)
    .single();

  return {
    success: true,
    data: {
      customer_id: lead?.customer_id || lead?.converted_to_customer_id || '',
      lead_id: leadId,
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

  // Strictly validate target is eligible Sales rep and NOT an Admin
  const { data: isEligible } = await admin.rpc('employee_is_eligible_sales', {
    p_employee_id: parsed.data.assigned_to,
  });
  if (!isEligible) {
    return { success: false, error: 'Cannot assign lead: employee must have Sales role and cannot be an Admin.' };
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
