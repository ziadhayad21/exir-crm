// src/app/(dashboard)/crm/actions.ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import {
  createCustomerSchema,
  updateCustomerSchema,
  deleteCustomerSchema,
  createDealSchema,
  updateDealSchema,
  deleteDealSchema,
  changeDealStageSchema,
  updateDealPaymentSchema,
  reassignDealSchema,
  createDealActivitySchema,
} from '@/lib/validations/crm';
import type {
  ActionResult,
  Customer,
  CustomerWithDeals,
  Deal,
  DealStage,
  DealWithRelations,
  DealActivity,
  CurrentUser,
  Employee,
  Lead,
} from '@/types';
import { revalidatePath } from 'next/cache';

// ─── Helper: Validate Deal Assignee ─────────────────────────────

export async function validateDealAssignee(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
  currentUser: CurrentUser
): Promise<{ valid: boolean; error?: string }> {
  const { data: target, error: targetError } = await admin
    .from('employees')
    .select('id, is_active')
    .eq('id', employeeId)
    .single();

  if (targetError || !target) {
    return { valid: false, error: 'Target employee not found.' };
  }
  if (!target.is_active) {
    return { valid: false, error: 'Cannot assign deal to an inactive employee.' };
  }

  // Admin can assign to any active employee
  if (hasPermission(currentUser, 'admin.system')) {
    return { valid: true };
  }

  // Verify target has CRM deal permissions
  const { data: perms } = await admin
    .from('user_roles')
    .select('roles(role_permissions(permissions(key)))')
    .eq('employee_id', employeeId);

  const permKeys: string[] = [];
  for (const ur of perms ?? []) {
    const rolesData = Array.isArray(ur.roles) ? ur.roles : [ur.roles];
    for (const role of rolesData) {
      if (!role) continue;
      const rolePerms = Array.isArray(role.role_permissions) ? role.role_permissions : [role.role_permissions];
      for (const rp of rolePerms) {
        if (!rp) continue;
        const p = Array.isArray(rp.permissions) ? rp.permissions[0] : rp.permissions;
        if (p?.key) permKeys.push(p.key);
      }
    }
  }

  const hasCrmAccess = permKeys.includes('crm.deals.write') || permKeys.includes('admin.system');
  if (!hasCrmAccess) {
    return { valid: false, error: 'Target employee does not have CRM deal permissions.' };
  }

  return { valid: true };
}

/**
 * Get active employees eligible to be assigned deals
 */
export async function getEligibleAssignees(): Promise<Employee[]> {
  await requireAnyPermission(['crm.deals.read_own', 'crm.deals.read_all', 'crm.deals.write']);
  const admin = createAdminClient();

  const { data: employees, error } = await admin
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .order('full_name');

  if (error || !employees) return [];
  return employees as Employee[];
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER ACTIONS
// ═══════════════════════════════════════════════════════════════

export async function getCustomers(): Promise<Customer[]> {
  const currentUser = await requireAnyPermission(['crm.customers.read_own', 'crm.customers.read_all']);
  const supabase = await createClient();

  let builder = supabase.from('customers').select('*').is('deleted_at', null);

  // Sales isolation: filter to own records if user lacks read_all
  if (!hasPermission(currentUser, 'crm.customers.read_all')) {
    builder = builder.eq('created_by', currentUser.employee.id);
  }

  const { data, error } = await builder.order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as Customer[];
}

export async function getCustomerById(id: string): Promise<CustomerWithDeals | null> {
  const currentUser = await requireAnyPermission(['crm.customers.read_own', 'crm.customers.read_all']);
  const supabase = await createClient();

  let builder = supabase.from('customers').select('*').eq('id', id).is('deleted_at', null);
  if (!hasPermission(currentUser, 'crm.customers.read_all')) {
    builder = builder.eq('created_by', currentUser.employee.id);
  }

  const { data: customer, error } = await builder.maybeSingle();
  if (error || !customer) return null;

  // Fetch customer's deals respecting visibility
  let dealsBuilder = supabase.from('deals').select('*').eq('customer_id', id);
  if (!hasPermission(currentUser, 'crm.deals.read_all')) {
    dealsBuilder = dealsBuilder.or(`assigned_to.eq.${currentUser.employee.id},created_by.eq.${currentUser.employee.id}`);
  }

  const { data: deals } = await dealsBuilder.order('created_at', { ascending: false });

  // Fetch customer's leads respecting visibility
  const admin = createAdminClient();
  let leadsBuilder = admin.from('leads').select('*').or(`customer_id.eq.${id},converted_to_customer_id.eq.${id}`);
  if (!hasPermission(currentUser, 'crm.leads.read_all')) {
    leadsBuilder = leadsBuilder.eq('assigned_to', currentUser.employee.id);
  }
  const { data: leads } = await leadsBuilder.order('created_at', { ascending: false });

  return {
    ...(customer as Customer),
    deals: (deals ?? []) as Deal[],
    leads: (leads ?? []) as Lead[],
  };
}

export interface CreateCustomerResult extends ActionResult<Customer> {
  warning?: string;
  duplicates?: Customer[];
}

export async function createCustomer(formData: FormData): Promise<CreateCustomerResult> {
  const currentUser = await requirePermission('crm.customers.write');

  const raw = {
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    source: formData.get('source') || 'manual',
    notes: formData.get('notes'),
    lead_id: formData.get('lead_id') || undefined,
    force: formData.get('force') === 'true',
  };

  const parsed = createCustomerSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Strict uniqueness check on active customers: duplicate phone or email MUST NOT be created
  const checks: string[] = [];
  if (parsed.data.phone) checks.push(`phone.eq.${parsed.data.phone}`);
  if (parsed.data.email) checks.push(`email.eq.${parsed.data.email}`);

  if (checks.length > 0) {
    const { data: duplicates } = await admin
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .or(checks.join(','));

    if (duplicates && duplicates.length > 0) {
      const match = duplicates[0];
      const matchField = match.phone === parsed.data.phone ? `phone number "${parsed.data.phone}"` : `email "${parsed.data.email}"`;
      return {
        success: false,
        error: `Cannot create customer: A customer with the same ${matchField} already exists (${match.full_name}). Duplicate customers are not allowed.`,
        duplicates: duplicates as Customer[],
      };
    }
  }

  const { data: customer, error } = await admin
    .from('customers')
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email || null,
      phone: parsed.data.phone,
      source: parsed.data.source,
      notes: parsed.data.notes || null,
      created_by: currentUser.employee.id,
    })
    .select('*')
    .single();

  if (error || !customer) {
    return { success: false, error: error?.message || 'Failed to create customer' };
  }

  // If a Lead was selected, link the newly created Customer to that Lead
  if (parsed.data.lead_id) {
    await admin
      .from('leads')
      .update({
        customer_id: customer.id,
        converted_to_customer_id: customer.id,
      })
      .eq('id', parsed.data.lead_id);

    // Also update any conversation attached to this lead
    await admin
      .from('conversations')
      .update({
        customer_id: customer.id,
      })
      .eq('lead_id', parsed.data.lead_id);
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'customer.created',
    module: 'crm',
    entity_type: 'customer',
    entity_id: customer.id,
    new_value: {
      ...customer,
      linked_lead_id: parsed.data.lead_id || null,
    },
  });

  revalidatePath('/crm/customers');
  revalidatePath('/crm/leads');
  revalidatePath('/crm/inbox');
  revalidatePath('/crm/deals');
  revalidatePath('/dashboard');

  return { success: true, data: customer as Customer };
}

export async function updateCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  const currentUser = await requirePermission('crm.customers.write');

  const raw = {
    id: formData.get('id'),
    full_name: formData.get('full_name') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    source: formData.get('source') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  };

  const parsed = updateCustomerSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Layer 2: Ownership check & verify active (not soft-deleted)
  const { data: existing, error: fetchError } = await admin
    .from('customers')
    .select('*')
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Customer not found or has been deleted.' };
  }

  const isOwner = existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.customers.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to modify this customer.' };
  }

  // Strict uniqueness check on update: verify phone/email does not collide with another active customer
  const updateChecks: string[] = [];
  if (parsed.data.phone && parsed.data.phone !== existing.phone) {
    updateChecks.push(`phone.eq.${parsed.data.phone}`);
  }
  if (parsed.data.email && parsed.data.email !== existing.email) {
    updateChecks.push(`email.eq.${parsed.data.email}`);
  }

  if (updateChecks.length > 0) {
    const { data: collisions } = await admin
      .from('customers')
      .select('id, full_name, phone, email')
      .neq('id', parsed.data.id)
      .is('deleted_at', null)
      .or(updateChecks.join(','));

    if (collisions && collisions.length > 0) {
      const match = collisions[0];
      const matchField = match.phone === parsed.data.phone ? `phone number "${parsed.data.phone}"` : `email "${parsed.data.email}"`;
      return {
        success: false,
        error: `Cannot update customer: Another customer (${match.full_name}) already has the same ${matchField}.`,
      };
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.source !== undefined) updates.source = parsed.data.source;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

  const { data: updated, error } = await admin
    .from('customers')
    .update(updates)
    .eq('id', parsed.data.id)
    .select('*')
    .single();

  if (error || !updated) {
    return { success: false, error: error?.message || 'Failed to update customer' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'customer.updated',
    module: 'crm',
    entity_type: 'customer',
    entity_id: updated.id,
    old_value: existing,
    new_value: updated,
  });

  revalidatePath('/crm/customers');
  revalidatePath(`/crm/customers/${updated.id}`);
  return { success: true, data: updated as Customer };
}

export async function softDeleteCustomer(formData: FormData): Promise<ActionResult<void>> {
  const currentUser = await requirePermission('crm.customers.write');

  const id = formData.get('id') as string;
  const parsed = deleteCustomerSchema.safeParse({ id });
  if (!parsed.success) {
    return { success: false, error: 'Invalid customer ID' };
  }

  const admin = createAdminClient();

  // 1. Fetch customer and verify not already deleted
  const { data: existing, error: fetchError } = await admin
    .from('customers')
    .select('*')
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Customer not found or already deleted.' };
  }

  // 2. Ownership check: creator or admin with read_all
  const isOwner = existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.customers.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to delete this customer.' };
  }

  // 3. Relational integrity check: Do not delete if customer has related Deals
  const { count: dealsCount, error: dealsErr } = await admin
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', parsed.data.id);

  if (dealsErr) {
    return { success: false, error: 'Failed to verify customer deal relationships.' };
  }

  if (dealsCount && dealsCount > 0) {
    return {
      success: false,
      error: 'Cannot delete customer with associated deals or commercial opportunities.',
    };
  }

  // 4. Soft delete: update deleted_at timestamp (never hard delete)
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from('customers')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', parsed.data.id);

  if (updateError) {
    return { success: false, error: updateError.message || 'Failed to delete customer' };
  }

  // 5. Audit log
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'customer.soft_deleted',
    module: 'crm',
    entity_type: 'customer',
    entity_id: parsed.data.id,
    old_value: existing,
    new_value: { ...existing, deleted_at: now },
  });

  revalidatePath('/crm/customers');
  revalidatePath(`/crm/customers/${parsed.data.id}`);
  revalidatePath('/crm/deals');
  revalidatePath('/dashboard');

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// DEALS ACTIONS
// ═══════════════════════════════════════════════════════════════

export async function getDeals(): Promise<DealWithRelations[]> {
  const currentUser = await requireAnyPermission(['crm.deals.read_own', 'crm.deals.read_all']);
  const supabase = await createClient();

  let builder = supabase
    .from('deals')
    .select('*, customer:customers(*), assigned_to_employee:employees!deals_assigned_to_fkey(*)')
    .is('deleted_at', null);

  // Sales isolation: filter to own assigned or created deals if user lacks read_all
  if (!hasPermission(currentUser, 'crm.deals.read_all')) {
    builder = builder.or(`assigned_to.eq.${currentUser.employee.id},created_by.eq.${currentUser.employee.id}`);
  }

  const { data, error } = await builder.order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as DealWithRelations[];
}

export async function getDealsByStage(): Promise<Record<DealStage, DealWithRelations[]>> {
  const currentUser = await requirePermission('crm.pipeline.view');
  const supabase = await createClient();

  let builder = supabase
    .from('deals')
    .select('*, customer:customers(*), assigned_to_employee:employees!deals_assigned_to_fkey(*)')
    .is('deleted_at', null);

  if (!hasPermission(currentUser, 'crm.deals.read_all')) {
    builder = builder.or(`assigned_to.eq.${currentUser.employee.id},created_by.eq.${currentUser.employee.id}`);
  }

  const { data, error } = await builder.order('created_at', { ascending: false });

  const grouped: Record<DealStage, DealWithRelations[]> = {
    new: [],
    follow_up: [],
    won: [],
    lost: [],
    contacted: [],
    qualified: [],
    proposal: [],
    negotiation: [],
  };

  if (!error && data) {
    for (const d of data as DealWithRelations[]) {
      if (grouped[d.stage]) {
        grouped[d.stage].push(d);
      }
    }
  }

  return grouped;
}

export async function getDealById(id: string): Promise<DealWithRelations | null> {
  const currentUser = await requireAnyPermission(['crm.deals.read_own', 'crm.deals.read_all']);
  const supabase = await createClient();

  let builder = supabase
    .from('deals')
    .select('*, customer:customers(*), assigned_to_employee:employees!deals_assigned_to_fkey(*)')
    .eq('id', id)
    .is('deleted_at', null);

  if (!hasPermission(currentUser, 'crm.deals.read_all')) {
    builder = builder.or(`assigned_to.eq.${currentUser.employee.id},created_by.eq.${currentUser.employee.id}`);
  }

  const { data: deal, error } = await builder.maybeSingle();
  if (error || !deal) return null;

  // Fetch activities
  const { data: activities } = await supabase
    .from('deal_activities')
    .select('*')
    .eq('deal_id', id)
    .order('created_at', { ascending: false });

  return {
    ...(deal as DealWithRelations),
    activities: (activities ?? []) as DealActivity[],
  };
}

export async function softDeleteDeal(formData: FormData): Promise<ActionResult<void>> {
  const currentUser = await requirePermission('crm.deals.write');

  const id = formData.get('id') as string;
  const parsed = deleteDealSchema.safeParse({ id });
  if (!parsed.success) {
    return { success: false, error: 'Invalid deal ID' };
  }

  const admin = createAdminClient();

  // 1. Fetch deal and check active status
  const { data: existing, error: fetchError } = await admin
    .from('deals')
    .select('*')
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Deal not found or already deleted.' };
  }

  // 2. Ownership check: assigned_to, created_by, or admin with read_all
  const isOwner = existing.assigned_to === currentUser.employee.id || existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to delete this deal.' };
  }

  // 3. Soft delete: update deleted_at timestamp (never hard delete)
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from('deals')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', parsed.data.id);

  if (updateError) {
    return { success: false, error: updateError.message || 'Failed to delete deal' };
  }

  // 4. Audit log
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.soft_deleted',
    module: 'crm',
    entity_type: 'deal',
    entity_id: parsed.data.id,
    old_value: existing,
    new_value: { ...existing, deleted_at: now },
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/deals/${parsed.data.id}`);
  revalidatePath('/crm/customers');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function createDeal(formData: FormData): Promise<ActionResult<Deal>> {
  const currentUser = await requirePermission('crm.deals.write');

  const raw = {
    title: formData.get('title'),
    customer_id: formData.get('customer_id'),
    assigned_to: formData.get('assigned_to') || currentUser.employee.id,
    stage: formData.get('stage') || 'new',
    total_amount: formData.get('total_amount') || formData.get('value'),
    expected_close_date: formData.get('expected_close_date'),
    notes: formData.get('notes'),
  };

  const parsed = createDealSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Validate deal assignee exists, is active, and eligible
  const validation = await validateDealAssignee(admin, parsed.data.assigned_to, currentUser);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid deal assignee.' };
  }

  // Validate customer exists and is active (not soft-deleted)
  const { data: targetCustomer, error: targetCustErr } = await admin
    .from('customers')
    .select('id, deleted_at')
    .eq('id', parsed.data.customer_id)
    .single();

  if (targetCustErr || !targetCustomer || targetCustomer.deleted_at) {
    return { success: false, error: 'Customer not found or has been deleted.' };
  }

  const dealTotal = parsed.data.total_amount ?? parsed.data.value ?? null;

  // Atomic creation via PostgreSQL RPC: inserts deal + creates initial activity in 1 TX
  const { data: dealId, error: rpcError } = await admin.rpc('crm_create_deal', {
    p_title: parsed.data.title,
    p_customer_id: parsed.data.customer_id,
    p_assigned_to: parsed.data.assigned_to,
    p_total_amount: dealTotal,
    p_expected_close_date: parsed.data.expected_close_date || null,
    p_notes: parsed.data.notes || null,
    p_created_by: currentUser.employee.id,
  });

  if (rpcError || !dealId) {
    return { success: false, error: rpcError?.message || 'Failed to create deal' };
  }

  // Fetch created deal
  const { data: createdDeal } = await admin.from('deals').select('*').eq('id', dealId).single();

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.created',
    module: 'crm',
    entity_type: 'deal',
    entity_id: dealId,
    new_value: createdDeal,
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/customers/${parsed.data.customer_id}`);
  revalidatePath('/dashboard');

  return { success: true, data: createdDeal as Deal };
}

export async function updateDeal(formData: FormData): Promise<ActionResult<Deal>> {
  const currentUser = await requirePermission('crm.deals.write');

  const raw = {
    id: formData.get('id'),
    title: formData.get('title') ?? undefined,
    customer_id: formData.get('customer_id') ?? undefined,
    total_amount: (formData.get('total_amount') || formData.get('value')) ?? undefined,
    expected_close_date: formData.get('expected_close_date') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  };

  const parsed = updateDealSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Layer 2: Ownership check
  const { data: existing, error: fetchError } = await admin
    .from('deals')
    .select('*')
    .eq('id', parsed.data.id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Deal not found.' };
  }

  const isOwner =
    existing.assigned_to === currentUser.employee.id || existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to modify this deal.' };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.customer_id !== undefined) updates.customer_id = parsed.data.customer_id;
  if (parsed.data.total_amount !== undefined) {
    updates.total_amount = parsed.data.total_amount;
    updates.value = parsed.data.total_amount;
    const paid = Number(existing.paid_amount || 0);
    updates.remaining_amount = Math.max(0, (parsed.data.total_amount ?? 0) - paid);
  }
  if (parsed.data.expected_close_date !== undefined) updates.expected_close_date = parsed.data.expected_close_date || null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

  const { data: updated, error } = await admin
    .from('deals')
    .update(updates)
    .eq('id', parsed.data.id)
    .select('*')
    .single();

  if (error || !updated) {
    return { success: false, error: error?.message || 'Failed to update deal' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.updated',
    module: 'crm',
    entity_type: 'deal',
    entity_id: updated.id,
    old_value: existing,
    new_value: updated,
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/deals/${updated.id}`);
  return { success: true, data: updated as Deal };
}

export async function changeDealStage(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.deals.write');

  const raw = {
    deal_id: formData.get('deal_id'),
    stage: formData.get('stage'),
    lost_reason: formData.get('lost_reason'),
    total_amount: formData.get('total_amount'),
    paid_amount: formData.get('paid_amount'),
    payment_method: formData.get('payment_method'),
  };

  const parsed = changeDealStageSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Layer 2: Ownership check
  const { data: existing, error: fetchError } = await admin
    .from('deals')
    .select('*')
    .eq('id', parsed.data.deal_id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Deal not found.' };
  }

  const isOwner =
    existing.assigned_to === currentUser.employee.id || existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to change the stage of this deal.' };
  }

  // Financial validation for Won stage
  if (parsed.data.stage === 'won') {
    const total = parsed.data.total_amount ?? 0;
    const paid = parsed.data.paid_amount ?? 0;
    if (total < 0) {
      return { success: false, error: 'Total amount must be greater than or equal to 0.' };
    }
    if (paid < 0) {
      return { success: false, error: 'Paid amount cannot be negative.' };
    }
    if (paid > total) {
      return { success: false, error: 'Paid amount cannot exceed total amount.' };
    }
  }

  // Atomic stage change via RPC (service_role only)
  const { error: rpcError } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: parsed.data.deal_id,
    p_new_stage: parsed.data.stage,
    p_actor_id: currentUser.employee.id,
    p_lost_reason: parsed.data.stage === 'lost' ? parsed.data.lost_reason || null : null,
    p_total_amount: parsed.data.stage === 'won' ? parsed.data.total_amount ?? null : null,
    p_paid_amount: parsed.data.stage === 'won' ? parsed.data.paid_amount ?? null : null,
    p_payment_method: parsed.data.stage === 'won' ? parsed.data.payment_method ?? null : null,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message || 'Failed to update deal stage' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.stage_changed',
    module: 'crm',
    entity_type: 'deal',
    entity_id: parsed.data.deal_id,
    old_value: { stage: existing.stage, total_amount: existing.total_amount, paid_amount: existing.paid_amount },
    new_value: {
      stage: parsed.data.stage,
      lost_reason: parsed.data.lost_reason,
      total_amount: parsed.data.total_amount,
      paid_amount: parsed.data.paid_amount,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/deals/${parsed.data.deal_id}`);
  revalidatePath('/dashboard');

  return { success: true };
}

export async function updateDealPayment(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.deals.write');

  const raw = {
    deal_id: formData.get('deal_id'),
    paid_amount: formData.get('paid_amount'),
    payment_method: formData.get('payment_method'),
  };

  const parsed = updateDealPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from('deals')
    .select('*')
    .eq('id', parsed.data.deal_id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Deal not found.' };
  }

  const isOwner =
    existing.assigned_to === currentUser.employee.id || existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to modify this deal.' };
  }

  if (existing.stage !== 'won') {
    return { success: false, error: 'Payment can only be updated for won deals.' };
  }

  const total = Number(existing.total_amount ?? existing.value ?? 0);
  if (parsed.data.paid_amount > total) {
    return { success: false, error: 'Paid amount cannot exceed total amount.' };
  }

  const { error: rpcError } = await admin.rpc('crm_update_deal_payment', {
    p_deal_id: parsed.data.deal_id,
    p_actor_id: currentUser.employee.id,
    p_paid_amount: parsed.data.paid_amount,
    p_payment_method: parsed.data.payment_method || null,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message || 'Failed to update payment' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.payment_updated',
    module: 'crm',
    entity_type: 'deal',
    entity_id: parsed.data.deal_id,
    old_value: { paid_amount: existing.paid_amount, remaining_amount: existing.remaining_amount },
    new_value: {
      paid_amount: parsed.data.paid_amount,
      remaining_amount: total - parsed.data.paid_amount,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/deals/${parsed.data.deal_id}`);
  revalidatePath('/dashboard');

  return { success: true };
}

export async function reassignDeal(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('crm.deals.reassign');

  const raw = {
    deal_id: formData.get('deal_id'),
    assigned_to: formData.get('assigned_to'),
  };

  const parsed = reassignDealSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Layer 2: Ownership check (Sales can only reassign deals they own)
  const { data: existing, error: fetchError } = await admin
    .from('deals')
    .select('assigned_to, created_by')
    .eq('id', parsed.data.deal_id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Deal not found.' };
  }

  const isOwner =
    existing.assigned_to === currentUser.employee.id || existing.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to reassign this deal.' };
  }

  // Validate target assignee
  const validation = await validateDealAssignee(admin, parsed.data.assigned_to, currentUser);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid target assignee.' };
  }

  // Atomic reassignment via RPC
  const { error: rpcError } = await admin.rpc('crm_reassign_deal', {
    p_deal_id: parsed.data.deal_id,
    p_new_assignee: parsed.data.assigned_to,
    p_actor_id: currentUser.employee.id,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message || 'Failed to reassign deal' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal.reassigned',
    module: 'crm',
    entity_type: 'deal',
    entity_id: parsed.data.deal_id,
    old_value: { assigned_to: existing.assigned_to },
    new_value: { assigned_to: parsed.data.assigned_to },
  });

  revalidatePath('/crm/deals');
  revalidatePath(`/crm/deals/${parsed.data.deal_id}`);
  return { success: true };
}

export async function addDealActivity(formData: FormData): Promise<ActionResult<DealActivity>> {
  const currentUser = await requirePermission('crm.deals.write');

  const raw = {
    deal_id: formData.get('deal_id'),
    type: formData.get('type'),
    content: formData.get('content'),
  };

  const parsed = createDealActivitySchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Invalid input data' };
  }

  const admin = createAdminClient();

  // Layer 2: Ownership check on parent deal
  const { data: deal, error: fetchError } = await admin
    .from('deals')
    .select('assigned_to, created_by')
    .eq('id', parsed.data.deal_id)
    .single();

  if (fetchError || !deal) {
    return { success: false, error: 'Deal not found.' };
  }

  const isOwner =
    deal.assigned_to === currentUser.employee.id || deal.created_by === currentUser.employee.id;
  const hasFullAccess = hasPermission(currentUser, 'crm.deals.read_all');

  if (!isOwner && !hasFullAccess) {
    return { success: false, error: 'You do not have permission to add activities to this deal.' };
  }

  const { data: activity, error } = await admin
    .from('deal_activities')
    .insert({
      deal_id: parsed.data.deal_id,
      actor_id: currentUser.employee.id,
      type: parsed.data.type,
      content: parsed.data.content,
    })
    .select('*')
    .single();

  if (error || !activity) {
    return { success: false, error: error?.message || 'Failed to add activity' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'deal_activity.created',
    module: 'crm',
    entity_type: 'deal_activity',
    entity_id: activity.id,
    new_value: activity,
  });

  revalidatePath(`/crm/deals/${parsed.data.deal_id}`);
  return { success: true, data: activity as DealActivity };
}
