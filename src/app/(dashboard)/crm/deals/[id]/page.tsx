// src/app/(dashboard)/crm/deals/[id]/page.tsx
// Legacy deal details route redirected to leads workspace

import { redirect } from 'next/navigation';

export default function DealDetailPage() {
  redirect('/crm/leads');
}
