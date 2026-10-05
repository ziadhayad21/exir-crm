// src/app/(dashboard)/crm/inbox/page.tsx
// Phase 4A: Unified Inbox server page.
// Restricts access to Sales and Admin roles.

import { requireAuth } from '@/lib/auth';
import { getConversations } from '../inbox-actions';
import { getCustomers } from '../actions';
import { InboxClient } from './inbox-client';

export const metadata = {
  title: 'Unified Inbox | CRM | El-Exir ERP',
  description: 'Manage WhatsApp, Instagram, Messenger, and multi-channel conversations.',
};

export default async function InboxPage() {
  const user = await requireAuth();

  // Load initial conversations (RLS Behavior B filtered) and customers
  const [conversations, customers] = await Promise.all([
    getConversations(),
    getCustomers().catch(() => []),
  ]);

  return (
    <InboxClient
      initialConversations={conversations}
      customers={customers}
      user={user}
    />
  );
}
