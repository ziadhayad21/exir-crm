// src/lib/validations/crm.ts
// Zod validation schemas for CRM operations

import { z } from 'zod';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const DEAL_STAGES = [
  'new',
  'follow_up',
  'won',
  'lost',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
] as const;

export const CUSTOMER_SOURCES = [
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
] as const;

// ─── Customer ───────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255, 'Name is too long'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(30, 'Phone is too long'),
  email: z
    .string()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  source: z.enum(CUSTOMER_SOURCES).optional().default('manual'),
  notes: z
    .string()
    .max(5000, 'Notes too long')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  force: z.boolean().optional().default(false), // bypass soft-dedup warning
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid customer ID'),
  full_name: z.string().min(1, 'Full name is required').max(255).optional(),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(30, 'Phone is too long')
    .optional(),
  email: z
    .string()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  source: z.enum(CUSTOMER_SOURCES).optional(),
  notes: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const deleteCustomerSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid customer ID'),
});

export type DeleteCustomerInput = z.infer<typeof deleteCustomerSchema>;

// ─── Payment Methods ───────────────────────────────────────────
export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'credit_card',
  'vodafone_cash',
  'instapay',
  'other',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ─── Deal ───────────────────────────────────────────────────────

export const createDealSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  customer_id: z.string().regex(uuidRegex, 'Invalid customer'),
  assigned_to: z.string().regex(uuidRegex, 'Invalid assignee'),
  stage: z.enum(DEAL_STAGES).default('new'),
  total_amount: z.coerce
    .number()
    .min(0, 'Total amount cannot be negative')
    .nullable()
    .optional(),
  value: z.coerce
    .number()
    .min(0, 'Value cannot be negative')
    .nullable()
    .optional(),
  expected_close_date: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  notes: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;

export const updateDealSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid deal ID'),
  title: z.string().min(1, 'Title is required').max(255).optional(),
  customer_id: z.string().regex(uuidRegex, 'Invalid customer').optional(),
  total_amount: z.coerce
    .number()
    .min(0, 'Total amount cannot be negative')
    .nullable()
    .optional(),
  value: z.coerce
    .number()
    .min(0, 'Value cannot be negative')
    .nullable()
    .optional(),
  expected_close_date: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  notes: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
});

export type UpdateDealInput = z.infer<typeof updateDealSchema>;

export const deleteDealSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid deal ID'),
});

export type DeleteDealInput = z.infer<typeof deleteDealSchema>;

export const changeDealStageSchema = z
  .object({
    deal_id: z.string().regex(uuidRegex, 'Invalid deal ID'),
    stage: z.enum(DEAL_STAGES),
    lost_reason: z
      .string()
      .max(1000, 'Lost reason is too long')
      .nullable()
      .optional()
      .or(z.literal(''))
      .transform((val) => (val === '' ? null : val)),
    total_amount: z.coerce
      .number()
      .min(0, 'Total amount cannot be negative')
      .nullable()
      .optional(),
    paid_amount: z.coerce
      .number()
      .min(0, 'Paid amount cannot be negative')
      .nullable()
      .optional(),
    payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  })
  .refine(
    (data) => data.stage !== 'lost' || (data.lost_reason && data.lost_reason.trim().length > 0),
    {
      message: 'A reason is required when marking a deal as lost',
      path: ['lost_reason'],
    }
  )
  .refine(
    (data) => {
      if (data.stage !== 'won') return true;
      return data.total_amount !== undefined && data.total_amount !== null && data.total_amount >= 0;
    },
    {
      message: 'Total amount is required and must be >= 0 when deal is won',
      path: ['total_amount'],
    }
  )
  .refine(
    (data) => {
      if (data.stage !== 'won') return true;
      return data.paid_amount !== undefined && data.paid_amount !== null && data.paid_amount >= 0;
    },
    {
      message: 'Paid amount is required and must be >= 0 when deal is won',
      path: ['paid_amount'],
    }
  )
  .refine(
    (data) => {
      if (data.stage !== 'won') return true;
      const total = data.total_amount ?? 0;
      const paid = data.paid_amount ?? 0;
      return paid <= total;
    },
    {
      message: 'Paid amount cannot exceed total amount',
      path: ['paid_amount'],
    }
  )
  .refine(
    (data) => {
      if (data.stage !== 'won') return true;
      return data.payment_method !== undefined && data.payment_method !== null;
    },
    {
      message: 'Payment method is required when deal is won',
      path: ['payment_method'],
    }
  );

export type ChangeDealStageInput = z.infer<typeof changeDealStageSchema>;

export const updateDealPaymentSchema = z
  .object({
    deal_id: z.string().regex(uuidRegex, 'Invalid deal ID'),
    paid_amount: z.coerce.number().min(0, 'Paid amount must be >= 0'),
    payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  });

export type UpdateDealPaymentInput = z.infer<typeof updateDealPaymentSchema>;

export const reassignDealSchema = z.object({
  deal_id: z.string().regex(uuidRegex, 'Invalid deal ID'),
  assigned_to: z.string().regex(uuidRegex, 'Invalid assignee'),
});

export type ReassignDealInput = z.infer<typeof reassignDealSchema>;

// ─── Deal Activity ──────────────────────────────────────────────

export const createDealActivitySchema = z.object({
  deal_id: z.string().regex(uuidRegex, 'Invalid deal ID'),
  type: z.enum(['note', 'call', 'email', 'meeting']),
  content: z.string().min(1, 'Content is required').max(5000),
});

export type CreateDealActivityInput = z.infer<typeof createDealActivitySchema>;

// ─── Lead (Phase 3) ─────────────────────────────────────────────

export const LEAD_SOURCES = [
  'manual',
  'referral',
  'walk_in',
  'website',
  'social_media',
  'whatsapp',
  'phone_call',
  'other',
] as const;

export const LEAD_STATUSES = ['in_progress', 'follow_up', 'won', 'lose'] as const;

export const createLeadSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255, 'Name is too long'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(30, 'Phone is too long')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  email: z
    .string()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
  source: z.enum(LEAD_SOURCES).optional().default('manual'),
  notes: z
    .string()
    .max(5000, 'Notes too long')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
}).refine(
  (data) => data.phone || data.email,
  {
    message: 'At least one contact method (phone or email) is required',
    path: ['phone'],
  }
);

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadStatusSchema = z.object({
  lead_id: z.string().regex(uuidRegex, 'Invalid lead ID'),
  status: z.enum(LEAD_STATUSES),
  follow_up_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Won fields
  service_name: z.string().nullable().optional(),
  total_amount: z.coerce.number().min(0, 'Total amount must be >= 0').nullable().optional(),
  paid_amount: z.coerce.number().min(0, 'Paid amount must be >= 0').nullable().optional(),
  remaining_amount: z.coerce.number().min(0).nullable().optional(),
  // Lose fields
  service_type: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
}).refine(
  (data) => {
    if (data.status === 'follow_up') {
      return !!data.follow_up_at && !isNaN(Date.parse(data.follow_up_at));
    }
    return true;
  },
  {
    message: 'Follow-up date/time is required when status is Follow Up',
    path: ['follow_up_at'],
  }
).refine(
  (data) => {
    if (data.status === 'won' && data.total_amount !== undefined && data.total_amount !== null && data.paid_amount !== undefined && data.paid_amount !== null) {
      return data.paid_amount <= data.total_amount;
    }
    return true;
  },
  {
    message: 'Paid amount cannot exceed total amount',
    path: ['paid_amount'],
  }
);

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;

export const reassignLeadSchema = z.object({
  lead_id: z.string().regex(uuidRegex, 'Invalid lead ID'),
  assigned_to: z.string().regex(uuidRegex, 'Invalid assignee'),
});

export type ReassignLeadInput = z.infer<typeof reassignLeadSchema>;

