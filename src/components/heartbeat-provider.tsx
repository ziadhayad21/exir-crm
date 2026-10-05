// src/components/heartbeat-provider.tsx
// Phase 3: Wraps the dashboard to provide heartbeat functionality for Sales employees.
'use client';

import { useHeartbeat } from '@/lib/hooks/useHeartbeat';
import type { CurrentUser } from '@/types';

interface HeartbeatProviderProps {
  user: CurrentUser;
  children: React.ReactNode;
}

export function HeartbeatProvider({ user, children }: HeartbeatProviderProps) {
  // Enable heartbeat only for Sales employees (who have crm.leads.read_own permission)
  const isSalesEmployee = user.roles.some((r) => r.name === 'Sales');

  useHeartbeat({ enabled: isSalesEmployee });

  return <>{children}</>;
}
