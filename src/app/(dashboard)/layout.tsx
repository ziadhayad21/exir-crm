// src/app/(dashboard)/layout.tsx
// Protected dashboard layout — requires authentication.
// Server Component that fetches user data and passes to client components.

import { requireAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { HeartbeatProvider } from '@/components/heartbeat-provider';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <HeartbeatProvider user={user}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar user={user} />
          <main
            style={{
              flex: 1,
              padding: '1.5rem',
              background: 'hsl(220 14% 96%)',
              overflowY: 'auto',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </HeartbeatProvider>
  );
}

