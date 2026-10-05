// src/app/(dashboard)/admin/page.tsx
// Admin landing page — redirects to employees management

import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect('/admin/employees');
}
