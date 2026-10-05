// src/app/(dashboard)/crm/services/page.tsx
// Deprecated: Tourism CRM does not use a predefined services catalog.

import { redirect } from 'next/navigation';

export default function ServicesPage() {
  redirect('/crm/deals');
}
