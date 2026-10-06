// src/types/database.ts
// Application-level database types for the El-Exir ERP system.
// These mirror the Supabase schema and are used throughout the application.

export interface Employee {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  is_online: boolean;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  description: string | null;
  module: string;
  created_at: string;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface UserRole {
  employee_id: string;
  role_id: string;
  assigned_at: string;
}

export interface AuditLog {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
}

// View types (joined data for UI display)
export interface EmployeeWithRoles extends Employee {
  roles: Role[];
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface CurrentUser {
  employee: Employee;
  roles: Role[];
  permissions: string[]; // permission keys
}

// ─── CRM Types ──────────────────────────────────────────────────

export type CustomerSource = 'manual' | 'referral' | 'walk_in' | 'website' | 'social_media' | 'other';

export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: CustomerSource;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  currency: string; // Always 'EGP' in Phase 2
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'vodafone_cash' | 'instapay' | 'other';

/**
 * Deal Stages — fixed for Phase 2.
 * Pipeline states for commercial opportunities (Deals).
 */
export type DealStage =
  | 'new'
  | 'follow_up'
  | 'won'
  | 'lost'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation';

export interface Deal {
  id: string;
  title: string;
  customer_id: string;
  assigned_to: string;
  stage: DealStage;
  total_amount: number | null;
  paid_amount: number;
  remaining_amount: number | null;
  payment_method: PaymentMethod | null;
  value?: number | null; // Backward compatibility alias of total_amount
  currency: string; // Always 'EGP' in Phase 2
  expected_close_date: string | null;
  lost_reason: string | null; // Required when stage = 'lost'
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  service_id?: string | null;
}

export type DealActivityType = 'note' | 'stage_change' | 'call' | 'email' | 'meeting' | 'system';

export interface DealActivity {
  id: string;
  deal_id: string;
  actor_id: string;
  type: DealActivityType;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── CRM View Types (joined) ───────────────────────────────────

export interface CustomerWithDeals extends Customer {
  deals: Deal[];
  created_by_name?: string;
}

export interface DealWithRelations extends Deal {
  customer: Customer;
  assigned_to_employee: Employee;
  service?: Service | null;
  activities?: DealActivity[];
}

export interface DealWithActivities extends Deal {
  activities: DealActivity[];
}

// ─── Lead Types (Phase 3) ──────────────────────────────────────

export type LeadSource = 'manual' | 'referral' | 'walk_in' | 'website' | 'social_media' | 'whatsapp' | 'phone_call' | 'other';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';
export type LeadAssignmentSource = 'automatic' | 'manual' | 'unassigned';

export interface Lead {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  notes: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  assignment_source: LeadAssignmentSource;
  status: LeadStatus;
  converted_to_customer_id: string | null;
  converted_to_deal_id: string | null;
  received_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LeadWithAssignee extends Lead {
  assigned_to_employee?: Employee | null;
}

// ─── Messaging & Inbox Types (Phase 4A) ─────────────────────────

export type ChannelType = 'whatsapp' | 'instagram' | 'messenger' | 'mock' | 'other';
export type WebhookEventStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface WebhookEvent {
  id: string;
  channel: ChannelType;
  event_id: string | null;
  payload: Record<string, unknown>;
  headers: Record<string, unknown> | null;
  status: WebhookEventStatus;
  error_message: string | null;
  retry_count: number;
  processed_at: string | null;
  created_at: string;
}

export interface ChannelIdentity {
  id: string;
  customer_id: string | null;
  channel: ChannelType;
  external_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = 'open' | 'pending_assignment' | 'closed' | 'archived';

export interface Conversation {
  id: string;
  channel: ChannelType;
  external_thread_id: string;
  channel_identity_id: string;
  customer_id: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = 'inbound' | 'outbound';
export type MessageSenderType = 'contact' | 'employee' | 'system' | 'bot';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'template' | 'system';
export type MessageStatus = 'received' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageAttachmentStatus = 'pending' | 'processing' | 'stored' | 'failed';
export type MessageAttachmentType = 'image' | 'audio' | 'video' | 'document' | 'other';

export interface MessageAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  provider: 'whatsapp' | 'messenger' | 'instagram' | 'mock' | 'local' | 'other';
  external_media_id: string | null;
  media_type: MessageAttachmentType;
  mime_type: string;
  file_name: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  caption: string | null;
  checksum: string | null;
  status: MessageAttachmentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  // Optional signed URL computed for client display
  signed_url?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  raw_event_id: string | null;
  direction: MessageDirection;
  sender_type: MessageSenderType;
  sender_employee_id: string | null;
  external_message_id: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  status: MessageStatus;
  error_detail: string | null;
  sent_at: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
  attachments?: MessageAttachment[];
}

// Inbox view / joined types
export interface ConversationWithDetails extends Conversation {
  channel_identity: ChannelIdentity;
  customer?: Customer | null;
  lead?: Lead | null;
  assigned_to_employee?: Employee | null;
  messages?: Message[];
}

