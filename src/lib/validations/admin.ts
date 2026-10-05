// src/lib/validations/admin.ts
// Zod validation schemas for admin operations

import { z } from 'zod';

// PostgreSQL-compatible UUID regex (supports RFC 4122 and custom seed UUIDs)
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const createEmployeeSchema = z.object({
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name is too long'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  phone: z
    .string()
    .max(20, 'Phone number is too long')
    .nullable()
    .optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  role_id: z
    .string()
    .min(1, 'Please select a role')
    .regex(uuidRegex, 'Invalid role selected'),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const assignRoleSchema = z.object({
  employee_id: z.string().regex(uuidRegex, 'Invalid employee ID'),
  role_id: z.string().regex(uuidRegex, 'Invalid role ID'),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const toggleEmployeeStatusSchema = z.object({
  employee_id: z.string().regex(uuidRegex, 'Invalid employee ID'),
  is_active: z.boolean(),
});

export type ToggleEmployeeStatusInput = z.infer<typeof toggleEmployeeStatusSchema>;
