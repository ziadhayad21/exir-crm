// src/lib/auth/index.ts
// Server-side authentication and authorization utilities.
// Use these in Server Components, Server Actions, and Route Handlers.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { CurrentUser, Employee, Role } from '@/types';

/**
 * Get the current authenticated Supabase user.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Get the current employee record linked to the authenticated user.
 * Returns null if not authenticated or no employee record exists.
 */
export async function getCurrentEmployee(): Promise<Employee | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !data) return null;

  return data as Employee;
}

/**
 * Get the full current user profile including roles and permissions.
 * Returns null if not authenticated or no employee record exists.
 */
export async function getCurrentUserProfile(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // Get employee record
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (empError || !employee) return null;

  // Get roles assigned to the employee
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_id, roles(id, name, description, created_at)')
    .eq('employee_id', employee.id);

  if (rolesError) return null;

  const roles: Role[] = (userRoles ?? [])
    .map((ur) => {
      const rolesData = ur.roles;
      if (Array.isArray(rolesData)) return rolesData[0] as Role;
      return rolesData as Role | null;
    })
    .filter((r): r is Role => r !== null);

  // Get all permissions for these roles
  const roleIds = roles.map((r) => r.id);
  let permissions: string[] = [];

  if (roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('permissions(key)')
      .in('role_id', roleIds);

    permissions = (rolePerms ?? [])
      .map((rp) => {
        const permsData = rp.permissions;
        if (Array.isArray(permsData)) return (permsData[0] as { key: string })?.key;
        return (permsData as { key: string } | null)?.key;
      })
      .filter((k): k is string => !!k);

    // Deduplicate
    permissions = [...new Set(permissions)];
  }

  return {
    employee: employee as Employee,
    roles,
    permissions,
  };
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect('/login');
  }
  if (!profile.employee.is_active) {
    // If account is deactivated, sign out and redirect
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }
  return profile;
}

/**
 * Require a specific permission. Redirects to /unauthorized if missing.
 */
export async function requirePermission(permissionKey: string): Promise<CurrentUser> {
  const profile = await requireAuth();
  if (!hasPermission(profile, permissionKey)) {
    redirect('/unauthorized');
  }
  return profile;
}

/**
 * Require at least one of the specified permissions. Redirects to /unauthorized if none match.
 */
export async function requireAnyPermission(permissionKeys: string[]): Promise<CurrentUser> {
  const profile = await requireAuth();
  if (!hasAnyPermission(profile, permissionKeys)) {
    redirect('/unauthorized');
  }
  return profile;
}

/**
 * Check if a user profile has a specific permission.
 */
export function hasPermission(profile: CurrentUser, permissionKey: string): boolean {
  // admin.system grants access to everything
  if (profile.permissions.includes('admin.system')) {
    return true;
  }
  return profile.permissions.includes(permissionKey);
}

/**
 * Check if a user profile has any of the given permissions.
 */
export function hasAnyPermission(profile: CurrentUser, permissionKeys: string[]): boolean {
  if (profile.permissions.includes('admin.system')) {
    return true;
  }
  return permissionKeys.some((key) => profile.permissions.includes(key));
}
