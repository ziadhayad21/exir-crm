// src/lib/auth/client-helpers.ts
// Client-safe authorization helpers.
// These are pure functions that work on CurrentUser data passed from the server.
// They do NOT make any database calls — they check the pre-fetched permissions array.

import type { CurrentUser } from '@/types';

/**
 * Check if the user has a specific permission.
 * For use in client components with pre-fetched user data.
 */
export function hasPermission(user: CurrentUser, permissionKey: string): boolean {
  if (user.permissions.includes('admin.system')) {
    return true;
  }
  return user.permissions.includes(permissionKey);
}

/**
 * Check if the user has any of the given permissions.
 */
export function hasAnyPermission(user: CurrentUser, permissionKeys: string[]): boolean {
  if (user.permissions.includes('admin.system')) {
    return true;
  }
  return permissionKeys.some((key) => user.permissions.includes(key));
}
