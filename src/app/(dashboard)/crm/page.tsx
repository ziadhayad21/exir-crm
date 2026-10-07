// src/app/(dashboard)/crm/page.tsx
// Redirect CRM overview directly to leads view

import { redirect } from 'next/navigation';

export default function CrmPage() {
  redirect('/crm/leads');
}
