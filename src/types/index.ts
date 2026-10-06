// src/types/index.ts
// Central export for all application types

export type {
  Employee,
  Role,
  Permission,
  RolePermission,
  UserRole,
  AuditLog,
  EmployeeWithRoles,
  RoleWithPermissions,
  CurrentUser,
  CustomerSource,
  Customer,
  Service,
  DealStage,
  Deal,
  DealActivityType,
  DealActivity,
  CustomerWithDeals,
  DealWithRelations,
  DealWithActivities,
  PaymentMethod,
  // Phase 3: Lead types
  LeadSource,
  LeadStatus,
  LeadAssignmentSource,
  Lead,
  LeadWithAssignee,
  // Phase 4A: Messaging & Inbox types
  ChannelType,
  WebhookEventStatus,
  WebhookEvent,
  ChannelIdentity,
  ConversationStatus,
  Conversation,
  MessageDirection,
  MessageSenderType,
  MessageType,
  MessageStatus,
  Message,
  ConversationWithDetails,
  // Phase 4E: Media Message Attachment types
  MessageAttachment,
  MessageAttachmentStatus,
  MessageAttachmentType,
} from './database';

// Generic API response types
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// Pagination types for future use
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
