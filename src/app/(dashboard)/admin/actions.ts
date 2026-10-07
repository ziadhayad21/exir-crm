// src/app/(dashboard)/admin/actions.ts
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import {
  createEmployeeSchema,
  assignRoleSchema,
  toggleEmployeeStatusSchema,
} from '@/lib/validations/admin';
import type { ActionResult, Employee, EmployeeWithRoles, Role } from '@/types';
import { revalidatePath } from 'next/cache';

// ─── Read Operations ────────────────────────────────────────────────

export async function getEmployees(): Promise<EmployeeWithRoles[]> {
  await requirePermission('admin.system');
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !employees) return [];

  // Get all user_roles with role info
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('employee_id, roles(id, name, description, created_at)');

  const roleMap = new Map<string, Role[]>();
  for (const ur of userRoles ?? []) {
    const roles = roleMap.get(ur.employee_id) ?? [];
    const roleData = ur.roles;
    if (roleData) {
      if (Array.isArray(roleData)) {
        roles.push(...(roleData as Role[]));
      } else {
        roles.push(roleData as Role);
      }
    }
    roleMap.set(ur.employee_id, roles);
  }

  return employees.map((emp) => ({
    ...(emp as Employee),
    roles: roleMap.get(emp.id) ?? [],
  }));
}

export async function getRoles(): Promise<Role[]> {
  await requirePermission('admin.system');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('name');

  if (error) {
    console.error('[Admin] Error fetching roles via session client:', error.message);
    const admin = createAdminClient();
    const { data: adminRoles, error: adminError } = await admin
      .from('roles')
      .select('*')
      .order('name');

    if (adminError) {
      console.error('[Admin] Error fetching roles via admin client:', adminError.message);
      return [];
    }
    return (adminRoles ?? []) as Role[];
  }
  return (data ?? []) as Role[];
}


// ─── Write Operations ───────────────────────────────────────────────

export async function createEmployee(formData: FormData): Promise<ActionResult<Employee>> {
  const currentUser = await requirePermission('admin.system');

  const raw = {
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone') || null,
    password: formData.get('password'),
    role_id: formData.get('role_id'),
  };

  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const admin = createAdminClient();

  // 1. Create auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    if (authError?.message.includes('already been registered')) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    return {
      success: false,
      error: 'Failed to create user account. Please try again.',
    };
  }

  // 2. Create employee record
  const { data: employee, error: empError } = await admin
    .from('employees')
    .insert({
      auth_user_id: authUser.user.id,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      is_active: true,
    })
    .select()
    .single();

  if (empError || !employee) {
    // Rollback: delete the auth user
    await admin.auth.admin.deleteUser(authUser.user.id);
    return {
      success: false,
      error: 'Failed to create employee record. Please try again.',
    };
  }

  // 3. Assign role
  const { error: roleError } = await admin
    .from('user_roles')
    .insert({
      employee_id: employee.id,
      role_id: parsed.data.role_id,
    });

  if (roleError) {
    console.error('[Admin] Failed to assign role:', roleError.message);
    // Rollback: delete created employee and auth user
    await admin.from('employees').delete().eq('id', employee.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return {
      success: false,
      error: 'Failed to assign role to employee. Creation was rolled back.',
    };
  }

  // 4. Audit log
  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'employee.created',
    module: 'admin',
    entity_type: 'employee',
    entity_id: employee.id,
    new_value: {
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      role_id: parsed.data.role_id,
    },
  });

  revalidatePath('/admin/employees');

  return {
    success: true,
    data: employee as Employee,
  };
}

export async function toggleEmployeeStatus(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('admin.system');

  const raw = {
    employee_id: formData.get('employee_id'),
    is_active: formData.get('is_active') === 'true',
  };

  const parsed = toggleEmployeeStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  // Don't allow deactivating yourself
  if (parsed.data.employee_id === currentUser.employee.id && !parsed.data.is_active) {
    return {
      success: false,
      error: 'You cannot deactivate your own account.',
    };
  }

  const admin = createAdminClient();

  // Get employee to find the old value
  const { data: existing } = await admin
    .from('employees')
    .select('is_active')
    .eq('id', parsed.data.employee_id)
    .single();

  const { error } = await admin
    .from('employees')
    .update({
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.employee_id);

  if (error) {
    return {
      success: false,
      error: 'Failed to update employee status.',
    };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: parsed.data.is_active ? 'employee.activated' : 'employee.deactivated',
    module: 'admin',
    entity_type: 'employee',
    entity_id: parsed.data.employee_id,
    old_value: { is_active: existing?.is_active },
    new_value: { is_active: parsed.data.is_active },
  });

  revalidatePath('/admin/employees');

  return { success: true };
}

export async function assignRole(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('admin.system');

  const raw = {
    employee_id: formData.get('employee_id'),
    role_id: formData.get('role_id'),
  };

  const parsed = assignRoleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  // Self-demotion safeguard: do not allow removing your own admin role
  if (parsed.data.employee_id === currentUser.employee.id) {
    const adminRoleId = currentUser.roles.find((r) => r.name === 'Admin')?.id;
    if (adminRoleId && parsed.data.role_id !== adminRoleId) {
      return {
        success: false,
        error: 'You cannot remove your own administrator role.',
      };
    }
  }

  const admin = createAdminClient();

  // Remove existing roles for this employee
  const { data: oldRoles } = await admin
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('employee_id', parsed.data.employee_id);

  await admin
    .from('user_roles')
    .delete()
    .eq('employee_id', parsed.data.employee_id);

  // Assign new role
  const { error } = await admin
    .from('user_roles')
    .insert({
      employee_id: parsed.data.employee_id,
      role_id: parsed.data.role_id,
    });

  if (error) {
    return {
      success: false,
      error: 'Failed to assign role.',
    };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'employee.role_assigned',
    module: 'admin',
    entity_type: 'employee',
    entity_id: parsed.data.employee_id,
    old_value: { roles: oldRoles?.map((r) => r.roles) },
    new_value: { role_id: parsed.data.role_id },
  });

  revalidatePath('/admin/employees');

  return { success: true };
}

export async function removeRole(formData: FormData): Promise<ActionResult> {
  const currentUser = await requirePermission('admin.system');

  const raw = {
    employee_id: formData.get('employee_id'),
    role_id: formData.get('role_id'),
  };

  const parsed = assignRoleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid parameters',
    };
  }

  // Self-demotion safeguard: do not allow removing your own role
  if (parsed.data.employee_id === currentUser.employee.id) {
    return {
      success: false,
      error: 'You cannot remove roles from your own account.',
    };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('user_roles')
    .delete()
    .eq('employee_id', parsed.data.employee_id)
    .eq('role_id', parsed.data.role_id);

  if (error) {
    return { success: false, error: 'Failed to remove role.' };
  }

  await writeAuditLog({
    actor_id: currentUser.employee.id,
    action: 'employee.role_removed',
    module: 'admin',
    entity_type: 'employee',
    entity_id: parsed.data.employee_id,
    old_value: { role_id: parsed.data.role_id },
  });

  revalidatePath('/admin/employees');
  return { success: true };
}
