// src/app/(dashboard)/crm/excel-actions.ts
// Server Actions for Excel (.xlsx) Import & Export for Leads and Customers.
// Strictly respects Supabase RLS, role-based visibility, and business rules.
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { buildExcelBase64, parseExcelFromBase64, normalizeRowKeys, getPhoneMatchKeys, normalizeToUuid } from '@/lib/excel';
import { revalidatePath } from 'next/cache';
import type { Customer, Lead, LeadStatus, LeadSource, CustomerSource } from '@/types';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface ExcelExportResult {
  success: boolean;
  base64?: string;
  filename?: string;
  rowCount?: number;
  error?: string;
}

export type ImportRowAction = 'create' | 'update' | 'skip' | 'error';

export interface ValidatedCustomerRow {
  rowNumber: number;
  id?: string | null;
  full_name: string;
  phone: string;
  email?: string | null;
  source: CustomerSource;
  notes?: string | null;
  action: ImportRowAction;
  message?: string;
  originalId?: string | null;
}

export interface ValidatedLeadRow {
  rowNumber: number;
  id?: string | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  status: LeadStatus;
  source: LeadSource;
  service_name?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  remaining_amount?: number | null;
  follow_up_at?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  action: ImportRowAction;
  message?: string;
  originalId?: string | null;
}

export interface ImportPreviewResult<T> {
  success: boolean;
  error?: string;
  summary: {
    total: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    errorCount: number;
  };
  rows: T[];
  canImport: boolean;
}

export interface ImportExecutionResult {
  success: boolean;
  error?: string;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. CUSTOMERS: EXPORT
// ═══════════════════════════════════════════════════════════════

export async function exportCustomersExcel(): Promise<ExcelExportResult> {
  const currentUser = await requireAnyPermission(['crm.customers.read_own', 'crm.customers.read_all']);
  const supabase = await createClient();

  // Query customers respecting RLS and Sales isolation
  let query = supabase.from('customers').select('*').is('deleted_at', null);
  if (!hasPermission(currentUser, 'crm.customers.read_all')) {
    query = query.eq('created_by', currentUser.employee.id);
  }

  const { data: customers, error } = await query.order('created_at', { ascending: false });

  if (error || !customers) {
    return { success: false, error: error?.message || 'Failed to fetch customers for export' };
  }

  // Format rows for Excel
  const exportRows = customers.map((c) => ({
    'ID': c.id,
    'Full Name': c.full_name,
    'Phone': c.phone || '',
    'Email': c.email || '',
    'Source': c.source ? c.source.charAt(0).toUpperCase() + c.source.slice(1) : 'Manual',
    'Notes': c.notes || '',
    'Created At': new Date(c.created_at).toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  const colWidths = [
    { wch: 38 }, // ID
    { wch: 26 }, // Full Name
    { wch: 18 }, // Phone
    { wch: 28 }, // Email
    { wch: 14 }, // Source
    { wch: 35 }, // Notes
    { wch: 20 }, // Created At
  ];

  const base64 = buildExcelBase64('Customers', exportRows, colWidths);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Customers_Report_${dateStr}.xlsx`;

  return {
    success: true,
    base64,
    filename,
    rowCount: customers.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. CUSTOMERS: VALIDATE IMPORT
// ═══════════════════════════════════════════════════════════════

export async function validateCustomersImportExcel(
  base64Data: string
): Promise<ImportPreviewResult<ValidatedCustomerRow>> {
  try {
    const currentUser = await requirePermission('crm.customers.write');
    const hasReadAll = hasPermission(currentUser, 'crm.customers.read_all');

    const rawRows = parseExcelFromBase64(base64Data);
    if (!rawRows || rawRows.length === 0) {
      return {
        success: false,
        error: 'The uploaded file does not contain readable data. Please ensure it is a valid .xlsx spreadsheet with column headers.',
        summary: { total: 0, createCount: 0, updateCount: 0, skipCount: 0, errorCount: 0 },
        rows: [],
        canImport: false,
      };
    }

    const admin = createAdminClient();

    // Fetch all active customers for matching strictly by ID
    const { data: allActiveCustomers } = await admin
      .from('customers')
      .select('id, full_name, phone, email, source, notes, created_by')
      .is('deleted_at', null);

    const existingCustomers = (allActiveCustomers ?? []) as Customer[];
    const existingById = new Map<string, Customer>();
    for (const c of existingCustomers) {
      existingById.set(c.id, c);
    }

    const seenIdsInBatch = new Set<string>();

    const validatedRows: ValidatedCustomerRow[] = [];
    let createCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // Excel row index (1-based, row 1 is header)
      const norm = normalizeRowKeys(rawRows[i] as Record<string, unknown>);

      // Extract fields with multiple possible header names
      const rawId = (norm['id'] || norm['customer_id'] || norm['client_id'] || '')?.toString().trim() || null;
      const fullName = (norm['full_name'] || norm['customer_name'] || norm['name'] || '')?.toString().trim();
      const phone = (norm['phone'] || norm['phone_number'] || norm['mobile'] || '')?.toString().trim();
      const rawEmail = (norm['email'] || norm['email_address'] || '')?.toString().trim();
      const email = rawEmail ? rawEmail.toLowerCase() : null;
      const rawSource = (norm['source'] || 'manual')?.toString().trim().toLowerCase() as CustomerSource;
      const notes = (norm['notes'] || norm['note'] || '')?.toString().trim() || null;

      // Check if entire row is empty
      if (!rawId && !fullName && !phone && !email && !notes) {
        validatedRows.push({
          rowNumber: rowNum,
          full_name: '',
          phone: '',
          source: 'manual',
          action: 'skip',
          message: 'صف فارغ تم تخطيه (Empty row skipped)',
        });
        skipCount++;
        continue;
      }

      // Validation 1: Full name is required
      if (!fullName) {
        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          full_name: '',
          phone: phone || '',
          email,
          source: rawSource || 'manual',
          notes,
          action: 'error',
          message: 'اسم العميل مطلوب (Full Name is required).',
        });
        errorCount++;
        continue;
      }

      // Validation 2: Contact check (Phone or Email required by database constraint)
      if (!phone && !email) {
        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          full_name: fullName,
          phone: '',
          email,
          source: rawSource || 'manual',
          notes,
          action: 'error',
          message: 'يجب توفير رقم الهاتف أو البريد الإلكتروني (Phone or Email is required).',
        });
        errorCount++;
        continue;
      }

      // Normalize ID (any arbitrary format: number, text, or UUID)
      const normalizedId = rawId ? normalizeToUuid(rawId) : null;

      // Check duplicate ID in the same file to prevent primary key collision
      if (normalizedId) {
        if (seenIdsInBatch.has(normalizedId)) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: normalizedId,
            full_name: fullName,
            phone: phone || '',
            email,
            source: rawSource || 'manual',
            notes,
            action: 'skip',
            message: `معرف مكرر في نفس الملف (${rawId}) - تم التخطي لمنع تكرار الـ ID.`,
          });
          skipCount++;
          continue;
        }
        seenIdsInBatch.add(normalizedId);
      }

      // Deduplication against database strictly by ID
      if (normalizedId && existingById.has(normalizedId)) {
        const existing = existingById.get(normalizedId)!;

        // Security check: Sales user cannot modify customer created by another employee
        if (!hasReadAll && existing.created_by !== currentUser.employee.id) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: existing.id,
            full_name: existing.full_name,
            phone: phone || existing.phone || '',
            email: email || existing.email,
            source: rawSource || existing.source,
            notes,
            action: 'error',
            message: 'ليس لديك صلاحية لتعديل هذا العميل (مسجل بواسطة موظف آخر).',
          });
          errorCount++;
          continue;
        }

        const targetName = fullName || existing.full_name;
        const targetPhone = phone || existing.phone || '';
        const targetEmail = (email !== null && email !== undefined && email !== '') ? email.toLowerCase() : existing.email;
        const targetSource = norm['source'] ? rawSource : existing.source;
        const targetNotes = (notes !== null && notes !== '') ? notes : existing.notes;

        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          id: existing.id,
          full_name: targetName,
          phone: targetPhone,
          email: targetEmail,
          source: targetSource,
          notes: targetNotes,
          action: 'update',
          message: `تحديث بيانات العميل "${existing.full_name}".`,
        });
        updateCount++;
      } else {
        // Brand new customer record
        const finalId = normalizedId || crypto.randomUUID();
        if (!normalizedId) {
          seenIdsInBatch.add(finalId);
        }

        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          id: finalId,
          full_name: fullName,
          phone: phone || '',
          email: email || null,
          source: rawSource || 'manual',
          notes,
          action: 'create',
          message: 'عميل جديد جاهز للإضافة.',
        });
        createCount++;
      }
    }

    return {
      success: true,
      summary: {
        total: rawRows.length,
        createCount,
        updateCount,
        skipCount,
        errorCount,
      },
      rows: validatedRows,
      canImport: errorCount === 0 && (createCount > 0 || updateCount > 0),
    };
  } catch (err: unknown) {
    console.error('[Excel] Error validating customers import:', err);
    const msg = err instanceof Error ? err.message : 'Failed to validate Excel file';
    return {
      success: false,
      error: `Validation error: ${msg}`,
      summary: { total: 0, createCount: 0, updateCount: 0, skipCount: 0, errorCount: 0 },
      rows: [],
      canImport: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. CUSTOMERS: EXECUTE IMPORT
// ═══════════════════════════════════════════════════════════════

export async function executeCustomersImportExcel(
  rowsToImport: ValidatedCustomerRow[]
): Promise<ImportExecutionResult> {
  const currentUser = await requirePermission('crm.customers.write');
  const hasReadAll = hasPermission(currentUser, 'crm.customers.read_all');

  const admin = createAdminClient();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const createdIds: string[] = [];
  const updatedIds: string[] = [];

  for (const row of rowsToImport) {
    if (row.action === 'skip') {
      skipped++;
      continue;
    }

    if (row.action === 'create') {
      const insertPayload: Record<string, unknown> = {
        full_name: row.full_name,
        phone: row.phone || null,
        email: row.email || null,
        source: row.source || 'manual',
        notes: row.notes || null,
        created_by: currentUser.employee.id,
      };
      if (row.id) {
        insertPayload.id = row.id;
      }

      const { data: newCust, error: insErr } = await admin
        .from('customers')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insErr || !newCust) {
        console.error('[Excel] Customer insert error:', insErr);
        errors++;
      } else {
        created++;
        createdIds.push(newCust.id);
      }
    } else if (row.action === 'update' && row.id) {
      // Security re-check: verify record exists and belongs to employee (if not read_all)
      const { data: existing } = await admin
        .from('customers')
        .select('*')
        .eq('id', row.id)
        .is('deleted_at', null)
        .single();

      if (!existing) {
        errors++;
        continue;
      }

      if (!hasReadAll && existing.created_by !== currentUser.employee.id) {
        errors++;
        continue;
      }

      const { error: updErr } = await admin
        .from('customers')
        .update({
          full_name: row.full_name,
          phone: row.phone || null,
          email: row.email || null,
          source: row.source,
          notes: row.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updErr) {
        console.error('[Excel] Customer update error:', updErr);
        errors++;
      } else {
        updated++;
        updatedIds.push(row.id);
      }
    }
  }

  // Audit log bulk import
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'customer.bulk_import',
    module: 'crm',
    entity_type: 'customer',
    new_value: {
      total: rowsToImport.length,
      created_count: created,
      updated_count: updated,
      created_ids: createdIds,
      updated_ids: updatedIds,
    },
  });

  revalidatePath('/crm/customers');
  revalidatePath('/crm/leads');
  revalidatePath('/dashboard');

  return {
    success: errors === 0,
    summary: {
      total: rowsToImport.length,
      created,
      updated,
      skipped,
      errors,
    },
  };
}


// ═══════════════════════════════════════════════════════════════
// 4. LEADS: EXPORT
// ═══════════════════════════════════════════════════════════════

export async function exportLeadsExcel(): Promise<ExcelExportResult> {
  const currentUser = await requireAnyPermission(['crm.leads.read_own', 'crm.leads.read_all']);
  const supabase = await createClient();
  const admin = createAdminClient();

  // Query leads respecting RLS and Sales isolation
  let query = supabase.from('leads').select('*');
  if (!hasPermission(currentUser, 'crm.leads.read_all')) {
    query = query.eq('assigned_to', currentUser.employee.id);
  }

  const { data: leads, error } = await query.order('created_at', { ascending: false });

  if (error || !leads) {
    return { success: false, error: error?.message || 'Failed to fetch leads for export' };
  }

  // Fetch employees for assignee names
  const assigneeIds = [
    ...new Set(leads.map((l) => l.assigned_to).filter((id): id is string => Boolean(id))),
  ];
  const employeeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: emps } = await admin
      .from('employees')
      .select('id, full_name')
      .in('id', assigneeIds);
    if (emps) {
      for (const e of emps) {
        employeeMap.set(e.id, e.full_name);
      }
    }
  }

  const STATUS_DISPLAY: Record<string, string> = {
    in_progress: 'In Progress',
    follow_up: 'Follow Up',
    won: 'Won',
    lose: 'Lose',
  };

  const exportRows = leads.map((l) => ({
    'ID': l.id,
    'Full Name': l.full_name,
    'Phone': l.phone || '',
    'Email': l.email || '',
    'Status': STATUS_DISPLAY[l.status] || l.status,
    'Source': l.source ? l.source.charAt(0).toUpperCase() + l.source.slice(1) : 'Manual',
    'Service Name': l.service_name || '',
    'Total Amount': l.total_amount ?? '',
    'Paid Amount': l.paid_amount ?? '',
    'Remaining Amount': l.remaining_amount ?? '',
    'Follow Up Date': l.follow_up_at
      ? new Date(l.follow_up_at).toLocaleString('en-US', {
          timeZone: 'Africa/Cairo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    'Lost Reason': l.lost_reason || '',
    'Notes': l.notes || '',
    'Assigned To': l.assigned_to ? employeeMap.get(l.assigned_to) || 'Unknown' : 'Unassigned',
    'Created At': new Date(l.created_at).toLocaleString('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  const colWidths = [
    { wch: 38 }, // ID
    { wch: 24 }, // Full Name
    { wch: 18 }, // Phone
    { wch: 26 }, // Email
    { wch: 15 }, // Status
    { wch: 14 }, // Source
    { wch: 22 }, // Service Name
    { wch: 14 }, // Total Amount
    { wch: 14 }, // Paid Amount
    { wch: 16 }, // Remaining Amount
    { wch: 20 }, // Follow Up Date
    { wch: 24 }, // Lost Reason
    { wch: 30 }, // Notes
    { wch: 20 }, // Assigned To
    { wch: 20 }, // Created At
  ];

  const base64 = buildExcelBase64('Leads', exportRows, colWidths);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Leads_Report_${dateStr}.xlsx`;

  return {
    success: true,
    base64,
    filename,
    rowCount: leads.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// 5. LEADS: VALIDATE IMPORT
// ═══════════════════════════════════════════════════════════════

export async function validateLeadsImportExcel(
  base64Data: string
): Promise<ImportPreviewResult<ValidatedLeadRow>> {
  try {
    const currentUser = await requirePermission('crm.leads.write');
    const hasReadAll = hasPermission(currentUser, 'crm.leads.read_all');

    const rawRows = parseExcelFromBase64(base64Data);
    if (!rawRows || rawRows.length === 0) {
      return {
        success: false,
        error: 'The uploaded file does not contain readable data. Please ensure it is a valid .xlsx spreadsheet with column headers.',
        summary: { total: 0, createCount: 0, updateCount: 0, skipCount: 0, errorCount: 0 },
        rows: [],
        canImport: false,
      };
    }

    const admin = createAdminClient();

    // Fetch all leads for matching strictly by ID
    const { data: allLeads } = await admin
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    const existingLeads = (allLeads ?? []) as Lead[];
    const existingById = new Map<string, Lead>();
    for (const l of existingLeads) {
      existingById.set(l.id, l);
    }

    const seenIdsInBatch = new Set<string>();

    const validatedRows: ValidatedLeadRow[] = [];
    let createCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2;
      const norm = normalizeRowKeys(rawRows[i] as Record<string, unknown>);

      const rawId = (norm['id'] || norm['lead_id'] || '')?.toString().trim() || null;
      const fullName = (norm['full_name'] || norm['lead_name'] || norm['name'] || '')?.toString().trim();
      const phone = (norm['phone'] || norm['phone_number'] || norm['mobile'] || '')?.toString().trim() || null;
      const rawEmail = (norm['email'] || norm['email_address'] || '')?.toString().trim();
      const email = rawEmail ? rawEmail.toLowerCase() : null;

      // Normalize status
      const rawStatus = (norm['status'] || 'in_progress')?.toString().trim().toLowerCase().replace(/[\s_-]+/g, '_');
      let status: LeadStatus = 'in_progress';
      if (rawStatus === 'follow_up' || rawStatus === 'followup') status = 'follow_up';
      else if (rawStatus === 'won' || rawStatus === 'win') status = 'won';
      else if (rawStatus === 'lose' || rawStatus === 'lost') status = 'lose';
      else if (rawStatus === 'in_progress' || rawStatus === 'inprogress' || rawStatus === 'new') status = 'in_progress';

      // Normalize source
      const rawSource = (norm['source'] || 'manual')?.toString().trim().toLowerCase() as LeadSource;
      const serviceName = (norm['service_name'] || norm['service'] || '')?.toString().trim() || null;
      const totalAmount = norm['total_amount'] || norm['total'] ? Number(norm['total_amount'] || norm['total']) : null;
      const paidAmount = norm['paid_amount'] || norm['paid'] ? Number(norm['paid_amount'] || norm['paid']) : null;
      const remainingAmount =
        norm['remaining_amount'] || norm['remaining']
          ? Number(norm['remaining_amount'] || norm['remaining'])
          : totalAmount !== null && paidAmount !== null
          ? Math.max(0, totalAmount - paidAmount)
          : null;

      const rawFollowUp = (norm['follow_up_date'] || norm['follow_up_at'] || norm['follow_up'] || '')?.toString().trim();
      let followUpAt: string | null = null;
      if (rawFollowUp) {
        const parsedDate = new Date(rawFollowUp);
        if (!isNaN(parsedDate.getTime())) {
          followUpAt = parsedDate.toISOString();
        }
      }

      const lostReason = (norm['lost_reason'] || norm['reason'] || '')?.toString().trim() || null;
      const notes = (norm['notes'] || norm['note'] || '')?.toString().trim() || null;

      // Check if entire row is empty
      if (!rawId && !fullName && !phone && !email && !notes) {
        validatedRows.push({
          rowNumber: rowNum,
          full_name: '',
          status: 'in_progress',
          source: 'manual',
          action: 'skip',
          message: 'صف فارغ تم تخطيه (Empty row skipped)',
        });
        skipCount++;
        continue;
      }

      // Constraint 1: full_name required
      if (!fullName) {
        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          full_name: '',
          status,
          source: rawSource,
          action: 'error',
          message: 'اسم العميل/العميل المحتمل مطلوب (Full Name is required).',
        });
        errorCount++;
        continue;
      }

      // Constraint 2: contact check (phone or email)
      if (!phone && !email) {
        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          full_name: fullName,
          status,
          source: rawSource,
          action: 'error',
          message: 'يجب توفير رقم الهاتف أو البريد الإلكتروني (Phone or Email is required).',
        });
        errorCount++;
        continue;
      }

      // Normalize ID (any arbitrary format: number, text, or UUID)
      const normalizedId = rawId ? normalizeToUuid(rawId) : null;

      // Check duplicate ID in file to prevent primary key collision
      if (normalizedId) {
        if (seenIdsInBatch.has(normalizedId)) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: normalizedId,
            full_name: fullName,
            phone,
            email,
            status,
            source: rawSource,
            action: 'skip',
            message: `معرف مكرر في نفس الملف (${rawId}) - تم التخطي لمنع تكرار الـ ID.`,
          });
          skipCount++;
          continue;
        }
        seenIdsInBatch.add(normalizedId);
      }

      // Deduplication against DB strictly by ID
      if (normalizedId && existingById.has(normalizedId)) {
        const existing = existingById.get(normalizedId)!;

        // Permission check: Sales cannot modify lead assigned to another sales employee
        if (!hasReadAll && existing.assigned_to !== currentUser.employee.id) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: existing.id,
            full_name: existing.full_name,
            phone: phone || existing.phone,
            email: email || existing.email,
            status: existing.status,
            source: rawSource,
            action: 'error',
            message: 'ليس لديك صلاحية لتعديل هذا الـ Lead (مسند لموظف آخر).',
          });
          errorCount++;
          continue;
        }

        const targetStatus = norm['status'] ? status : existing.status;
        const targetFollowUpAt = targetStatus === 'follow_up' ? (followUpAt || existing.follow_up_at) : null;

        if (targetStatus === 'follow_up' && !targetFollowUpAt) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: existing.id,
            full_name: fullName || existing.full_name,
            phone: phone || existing.phone,
            email: email || existing.email,
            status: targetStatus,
            source: rawSource,
            action: 'error',
            message: 'تاريخ المتابعة مطلوب عند تعيين الحالة إلى متابعة (Follow Up).',
          });
          errorCount++;
          continue;
        }

        const targetTotal = totalAmount !== null ? totalAmount : existing.total_amount;
        const targetPaid = paidAmount !== null ? paidAmount : existing.paid_amount;
        const targetRemaining = remainingAmount !== null ? remainingAmount : existing.remaining_amount;

        if (
          targetStatus === 'won' &&
          targetPaid !== null &&
          targetPaid !== undefined &&
          targetTotal !== null &&
          targetTotal !== undefined &&
          targetPaid > targetTotal
        ) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            id: existing.id,
            full_name: fullName || existing.full_name,
            phone: phone || existing.phone,
            email: email || existing.email,
            status: targetStatus,
            source: rawSource,
            action: 'error',
            message: `المبلغ المدفوع (${targetPaid}) لا يمكن أن يتجاوز الإجمالي (${targetTotal}).`,
          });
          errorCount++;
          continue;
        }

        const targetName = fullName || existing.full_name;
        const targetPhone = phone || existing.phone;
        const targetEmail = email || existing.email;
        const targetSource = norm['source'] ? rawSource : existing.source;
        const targetServiceName = norm['service_name'] || norm['service'] ? serviceName : existing.service_name;
        const targetLostReason = norm['lost_reason'] || norm['reason'] ? lostReason : existing.lost_reason;
        const targetNotes = (notes !== null && notes !== '') ? notes : existing.notes;

        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          id: existing.id,
          full_name: targetName,
          phone: targetPhone,
          email: targetEmail,
          status: targetStatus,
          source: targetSource,
          service_name: targetServiceName,
          total_amount: targetTotal,
          paid_amount: targetPaid,
          remaining_amount: targetRemaining,
          follow_up_at: targetFollowUpAt,
          lost_reason: targetLostReason,
          notes: targetNotes,
          action: 'update',
          message: `تحديث بيانات الـ Lead الحالي "${existing.full_name}".`,
        });
        updateCount++;
      } else {
        // Create new Lead
        if (status === 'follow_up' && !followUpAt) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            full_name: fullName,
            phone,
            email,
            status,
            source: rawSource,
            action: 'error',
            message: 'تاريخ المتابعة مطلوب عند تعيين الحالة إلى متابعة (Follow Up).',
          });
          errorCount++;
          continue;
        }

        if (status === 'won' && paidAmount !== null && totalAmount !== null && paidAmount > totalAmount) {
          validatedRows.push({
            rowNumber: rowNum,
            originalId: rawId,
            full_name: fullName,
            phone,
            email,
            status,
            source: rawSource,
            action: 'error',
            message: `المبلغ المدفوع (${paidAmount}) لا يمكن أن يتجاوز الإجمالي (${totalAmount}).`,
          });
          errorCount++;
          continue;
        }

        const finalId = normalizedId || crypto.randomUUID();
        if (!normalizedId) {
          seenIdsInBatch.add(finalId);
        }

        validatedRows.push({
          rowNumber: rowNum,
          originalId: rawId,
          id: finalId,
          full_name: fullName,
          phone,
          email,
          status,
          source: rawSource || 'manual',
          service_name: serviceName,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          remaining_amount: remainingAmount,
          follow_up_at: status === 'follow_up' ? followUpAt : null,
          lost_reason: lostReason,
          notes,
          action: 'create',
          message: 'Lead جديد جاهز للإضافة.',
        });
        createCount++;
      }
    }

    return {
      success: true,
      summary: {
        total: rawRows.length,
        createCount,
        updateCount,
        skipCount,
        errorCount,
      },
      rows: validatedRows,
      canImport: errorCount === 0 && (createCount > 0 || updateCount > 0),
    };
  } catch (err: unknown) {
    console.error('[Excel] Error validating leads import:', err);
    const msg = err instanceof Error ? err.message : 'Failed to validate Excel file';
    return {
      success: false,
      error: `Validation error: ${msg}`,
      summary: { total: 0, createCount: 0, updateCount: 0, skipCount: 0, errorCount: 0 },
      rows: [],
      canImport: false,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. LEADS: EXECUTE IMPORT
// ═══════════════════════════════════════════════════════════════

export async function executeLeadsImportExcel(
  rowsToImport: ValidatedLeadRow[]
): Promise<ImportExecutionResult> {
  const currentUser = await requirePermission('crm.leads.write');
  const hasReadAll = hasPermission(currentUser, 'crm.leads.read_all');

  const admin = createAdminClient();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const createdIds: string[] = [];
  const updatedIds: string[] = [];

  for (const row of rowsToImport) {
    if (row.action === 'skip') {
      skipped++;
      continue;
    }

    if (row.action === 'create') {
      // 1. Check for matching active customer to link
      let linkedCustomerId: string | null = null;
      const contactChecks: string[] = [];
      if (row.phone) contactChecks.push(`phone.eq.${row.phone}`);
      if (row.email) contactChecks.push(`email.eq.${row.email}`);

      if (contactChecks.length > 0) {
        const { data: matchedCust } = await admin
          .from('customers')
          .select('id')
          .is('deleted_at', null)
          .or(contactChecks.join(','))
          .limit(1);

        if (matchedCust && matchedCust.length > 0) {
          linkedCustomerId = matchedCust[0].id;
        }
      }

      // 2. Assignment decision:
      // If user is Sales without read_all, assign directly to themselves
      // If Admin, assign to unassigned and run assign_lead_to_sales RPC
      const assignToSelf = !hasReadAll;
      const initialAssignedTo = assignToSelf ? currentUser.employee.id : null;
      const initialSource = assignToSelf ? 'manual' : 'unassigned';

      const insertPayload: Record<string, unknown> = {
        full_name: row.full_name,
        phone: row.phone || null,
        email: row.email || null,
        source: row.source || 'manual',
        status: row.status,
        follow_up_at: row.status === 'follow_up' ? row.follow_up_at : null,
        service_name: row.service_name || null,
        total_amount: row.total_amount || null,
        paid_amount: row.paid_amount || null,
        remaining_amount: row.remaining_amount || null,
        lost_reason: row.lost_reason || null,
        notes: row.notes || null,
        customer_id: linkedCustomerId,
        converted_to_customer_id: linkedCustomerId,
        assigned_to: initialAssignedTo,
        assigned_at: assignToSelf ? new Date().toISOString() : null,
        assignment_source: initialSource,
      };
      if (row.id) {
        insertPayload.id = row.id;
      }

      const { data: newLead, error: insErr } = await admin
        .from('leads')
        .insert(insertPayload)
        .select('id')
        .single();


      if (insErr || !newLead) {
        errors++;
      } else {
        created++;
        createdIds.push(newLead.id);

        // If created by Admin and unassigned, trigger standard automatic distribution
        if (!assignToSelf) {
          await admin.rpc('assign_lead_to_sales', {
            p_lead_id: newLead.id,
            p_business_tz: 'Africa/Cairo',
          });
        }
      }
    } else if (row.action === 'update' && row.id) {
      // Security re-check: verify lead exists and assigned to employee (if not read_all)
      const { data: existing } = await admin
        .from('leads')
        .select('*')
        .eq('id', row.id)
        .single();

      if (!existing) {
        errors++;
        continue;
      }

      if (!hasReadAll && existing.assigned_to !== currentUser.employee.id) {
        errors++;
        continue;
      }

      // If status changed, use change_lead_status RPC for authoritative state transition
      if (row.status !== existing.status) {
        await admin.rpc('change_lead_status', {
          p_lead_id: row.id,
          p_new_status: row.status,
          p_changed_by: currentUser.employee.id,
          p_follow_up_at: row.status === 'follow_up' ? row.follow_up_at : null,
          p_notes: row.notes || null,
        });
      }

      // Update remaining allowed fields (never modify assigned_to or audit fields)
      const { error: updErr } = await admin
        .from('leads')
        .update({
          full_name: row.full_name,
          phone: row.phone || null,
          email: row.email || null,
          source: row.source,
          follow_up_at: row.status === 'follow_up' ? row.follow_up_at : null,
          service_name: row.service_name || null,
          total_amount: row.total_amount || null,
          paid_amount: row.paid_amount || null,
          remaining_amount: row.remaining_amount || null,
          lost_reason: row.lost_reason || null,
          notes: row.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updErr) {
        errors++;
      } else {
        updated++;
        updatedIds.push(row.id);
      }
    }
  }

  // Audit log bulk import
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'lead.bulk_import',
    module: 'crm',
    entity_type: 'lead',
    new_value: {
      total: rowsToImport.length,
      created_count: created,
      updated_count: updated,
      created_ids: createdIds,
      updated_ids: updatedIds,
    },
  });

  revalidatePath('/crm/leads');
  revalidatePath('/crm/customers');
  revalidatePath('/dashboard');

  return {
    success: errors === 0,
    summary: {
      total: rowsToImport.length,
      created,
      updated,
      skipped,
      errors,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. TEMPLATE GENERATORS
// ═══════════════════════════════════════════════════════════════

export async function getCustomerExcelTemplate(): Promise<ExcelExportResult> {
  const sampleRows = [
    {
      'Full Name': 'Ahmed Mansour',
      'Phone': '+201012345678',
      'Email': 'ahmed@example.com',
      'Source': 'Manual',
      'Notes': 'Example customer notes. ID column is optional for new records.',
    },
  ];
  const colWidths = [
    { wch: 25 },
    { wch: 18 },
    { wch: 25 },
    { wch: 15 },
    { wch: 45 },
  ];
  const base64 = buildExcelBase64('Customers_Template', sampleRows, colWidths);
  return { success: true, base64, filename: 'Customers_Import_Template.xlsx' };
}

export async function getLeadExcelTemplate(): Promise<ExcelExportResult> {
  const sampleRows = [
    {
      'Full Name': 'Mohamed Ali',
      'Phone': '+201098765432',
      'Email': 'mohamed@example.com',
      'Status': 'In Progress',
      'Source': 'Manual',
      'Service Name': 'Turkey Summer Package',
      'Total Amount': 25000,
      'Paid Amount': 10000,
      'Notes': 'Example lead notes. ID column is optional for new records.',
    },
  ];
  const colWidths = [
    { wch: 25 },
    { wch: 18 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 45 },
  ];
  const base64 = buildExcelBase64('Leads_Template', sampleRows, colWidths);
  return { success: true, base64, filename: 'Leads_Import_Template.xlsx' };
}

