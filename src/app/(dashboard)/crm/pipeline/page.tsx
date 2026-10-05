// src/app/(dashboard)/crm/pipeline/page.tsx
// Deprecated: Pipeline removed. Redirect to deals view.

import { redirect } from 'next/navigation';

export default function PipelinePage() {
  redirect('/crm/deals');
}
