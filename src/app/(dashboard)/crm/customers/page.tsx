// src/app/(dashboard)/crm/customers/page.tsx

import { requireAuth } from '@/lib/auth';
import { getCustomers } from '../actions';
import { CustomersClient } from './customers-client';

export const metadata = {
  title: 'Customers | CRM | El-Exir ERP',
  description: 'Manage customer contacts and relationships.',
};

export default async function CustomersPage() {
  const user = await requireAuth();
  const customers = await getCustomers();

  return <CustomersClient customers={customers} user={user} />;
}
