// src/app/(dashboard)/crm/deals/page.tsx
// Legacy deals route redirected to leads workspace

import { redirect } from 'next/navigation';

export default function DealsPage() {
  redirect('/crm/leads');
}
