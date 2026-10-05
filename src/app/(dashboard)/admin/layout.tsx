// src/app/(dashboard)/admin/layout.tsx
// Admin section layout — requires admin.system permission.
// Server-side authorization check — users cannot bypass by entering the URL.

import { requirePermission } from '@/lib/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will redirect to /unauthorized if the user lacks admin.system permission
  await requirePermission('admin.system');

  return <>{children}</>;
}
