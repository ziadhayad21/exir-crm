// src/app/(dashboard)/crm/layout.tsx
// CRM module layout with server-side authorization check.
// Ensures that only users with CRM access (Admin, Sales, Accountant) can access the CRM module.

import { requireAnyPermission } from '@/lib/auth';

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Requires at least one CRM permission; redirects HR or unauthorized users to /unauthorized
  await requireAnyPermission([
    'crm.leads.read_own',
    'crm.leads.read_all',
    'crm.deals.read_own',
    'crm.deals.read_all',
    'crm.customers.read_own',
    'crm.customers.read_all',
    'crm.pipeline.view',
  ]);

  return <div style={{ width: '100%', minHeight: '100%' }}>{children}</div>;
}

