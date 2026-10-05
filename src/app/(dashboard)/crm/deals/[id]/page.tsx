// src/app/(dashboard)/crm/deals/[id]/page.tsx

import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getDealById, getEligibleAssignees } from '../../actions';
import { DealDetailClient } from './deal-detail-client';

interface DealDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Deal Details | CRM | El-Exir ERP',
};

export default async function DealDetailPage({ params }: DealDetailPageProps) {
  const { id } = await params;
  const user = await requireAuth();

  const [deal, assignees] = await Promise.all([
    getDealById(id),
    getEligibleAssignees(),
  ]);

  if (!deal) {
    notFound();
  }

  return <DealDetailClient deal={deal} assignees={assignees} user={user} />;
}
