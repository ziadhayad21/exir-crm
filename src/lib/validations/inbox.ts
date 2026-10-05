// src/lib/validations/inbox.ts
// Zod validation schemas for Unified Inbox and Messaging operations

import { z } from 'zod';

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const CHANNELS = ['whatsapp', 'instagram', 'messenger', 'mock', 'other'] as const;
export const CONVERSATION_STATUSES = ['open', 'pending_assignment', 'closed', 'archived'] as const;
export const MESSAGE_TYPES = ['text', 'image', 'audio', 'video', 'document', 'location', 'template', 'system'] as const;

export const sendReplySchema = z.object({
  conversation_id: z.string().regex(uuidRegex, 'Invalid conversation ID'),
  content: z.string().min(1, 'Message content cannot be empty').max(10000, 'Message content is too long'),
  message_type: z.enum(MESSAGE_TYPES).optional().default('text'),
  media_url: z.string().url('Invalid media URL').nullable().optional(),
});

export type SendReplyInput = z.input<typeof sendReplySchema>;

export const updateConversationStatusSchema = z.object({
  conversation_id: z.string().regex(uuidRegex, 'Invalid conversation ID'),
  status: z.enum(CONVERSATION_STATUSES),
});

export type UpdateConversationStatusInput = z.input<typeof updateConversationStatusSchema>;

export const linkCustomerSchema = z.object({
  conversation_id: z.string().regex(uuidRegex, 'Invalid conversation ID'),
  customer_id: z.string().regex(uuidRegex, 'Invalid customer ID'),
});

export type LinkCustomerInput = z.input<typeof linkCustomerSchema>;

export const simulateMessageSchema = z.object({
  channel: z.enum(CHANNELS).default('mock'),
  external_id: z.string().min(1, 'External ID is required').max(255),
  display_name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  content: z.string().min(1, 'Content is required').max(10000),
  message_type: z.enum(MESSAGE_TYPES).default('text'),
});

export type SimulateMessageInput = z.input<typeof simulateMessageSchema>;
