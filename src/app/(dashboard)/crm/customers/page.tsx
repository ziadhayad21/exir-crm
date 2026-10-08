import { requireAuth } from '@/lib/auth';
import { getCustomers } from '../actions';
import { getLeads } from '../lead-actions';
import { CustomersClient } from './customers-client';

export const metadata = {
  title: 'Customers | CRM | El-Exir ERP',
  description: 'Manage customer contacts and relationships.',
};

export default async function CustomersPage() {
  const user = await requireAuth();
  const [customers, leads] = await Promise.all([
    getCustomers(),
    getLeads().catch(() => []),
  ]);

  return <CustomersClient customers={customers} leads={leads} user={user} />;
}
