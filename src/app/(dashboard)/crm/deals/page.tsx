// src/app/(dashboard)/crm/deals/page.tsx

import { requireAuth } from '@/lib/auth';
import { getDeals, getCustomers, getEligibleAssignees } from '../actions';
import { DealsClient } from './deals-client';

export const metadata = {
  title: 'Deals | CRM | El-Exir ERP',
  description: 'Manage commercial opportunities, pipeline stages, and payment details.',
};

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; customer_id?: string }>;
}) {
  const user = await requireAuth();
  const [deals, customers, assignees] = await Promise.all([
    getDeals(),
    getCustomers(),
    getEligibleAssignees(),
  ]);

  const resolvedParams = await searchParams;

  return (
    <DealsClient
      deals={deals}
      customers={customers}
      assignees={assignees}
      user={user}
      initialOpenCreate={resolvedParams.new === 'true'}
      initialCustomerId={resolvedParams.customer_id}
    />
  );
}
