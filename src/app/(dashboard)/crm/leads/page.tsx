// src/app/(dashboard)/crm/leads/page.tsx
// Phase 3: Leads list page — server component.

import { requireAuth } from '@/lib/auth';
import { getCustomers } from '../actions';
import { getLeads, getTodayLeadCount, getEligibleSalesEmployees } from '../lead-actions';
import { LeadsClient } from './leads-client';

export const metadata = {
  title: 'Leads | CRM | El-Exir ERP',
  description: 'Manage incoming leads and automatic sales assignment.',
};

export default async function LeadsPage() {
  const user = await requireAuth();
  const [leads, todayCount, assignees, customers] = await Promise.all([
    getLeads(),
    getTodayLeadCount(),
    getEligibleSalesEmployees(),
    getCustomers().catch(() => []),
  ]);

  return (
    <LeadsClient
      leads={leads}
      assignees={assignees}
      user={user}
      todayCount={todayCount}
      customers={customers}
    />
  );
}
