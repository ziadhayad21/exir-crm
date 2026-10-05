// src/app/(dashboard)/crm/customers/[id]/page.tsx

import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getCustomerById } from '../../actions';
import { CustomerDetailClient } from './customer-detail-client';

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Customer Details | CRM | El-Exir ERP',
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();
  const customer = await getCustomerById(id);

  if (!customer) {
    notFound();
  }

  return <CustomerDetailClient customer={customer} user={user} />;
}
