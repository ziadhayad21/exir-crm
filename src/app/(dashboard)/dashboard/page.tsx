// src/app/(dashboard)/dashboard/page.tsx
// Dashboard home page — shows welcome message, user info, system status.

import { requireAuth } from '@/lib/auth';
import {
  Users,
  Shield,
  Key,
  Activity,
  Briefcase,
  DollarSign,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency } from '@/lib/utils';

async function getSystemStats() {
  const supabase = await createClient();

  const [
    { count: employeeCount },
    { count: roleCount },
    { count: permissionCount },
    { count: auditCount },
  ] = await Promise.all([
    supabase.from('employees').select('*', { count: 'exact', head: true }),
    supabase.from('roles').select('*', { count: 'exact', head: true }),
    supabase.from('permissions').select('*', { count: 'exact', head: true }),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
  ]);

  return {
    employees: employeeCount ?? 0,
    roles: roleCount ?? 0,
    permissions: permissionCount ?? 0,
    auditEntries: auditCount ?? 0,
  };
}

interface CrmStats {
  customerCount: number;
  activeDealCount: number;
  pipelineValue: number;
  winRate: number;
  isOwnOnly: boolean;
}

async function getCrmStats(employeeId: string, isOwnOnly: boolean): Promise<CrmStats> {
  const adminClient = createAdminClient();

  let customerQuery = adminClient.from('customers').select('*', { count: 'exact', head: true });
  if (isOwnOnly) {
    customerQuery = customerQuery.eq('created_by', employeeId);
  }

  let dealsQuery = adminClient.from('deals').select('stage, total_amount, deal_value');
  if (isOwnOnly) {
    dealsQuery = dealsQuery.or(`assigned_to.eq.${employeeId},created_by.eq.${employeeId}`);
  }

  const [{ count: customerCount }, { data: deals, error: dealsError }] = await Promise.all([
    customerQuery,
    dealsQuery,
  ]);

  if (dealsError || !deals) {
    return {
      customerCount: customerCount ?? 0,
      activeDealCount: 0,
      pipelineValue: 0,
      winRate: 0,
      isOwnOnly,
    };
  }

  let activeCount = 0;
  let pipelineSum = 0;
  let wonCount = 0;
  let lostCount = 0;

  for (const deal of deals) {
    if (deal.stage === 'won') {
      wonCount++;
    } else if (deal.stage === 'lost') {
      lostCount++;
    } else {
      activeCount++;
      const val = (deal as { total_amount?: number | null; deal_value?: number | null }).total_amount ??
                  (deal as { total_amount?: number | null; deal_value?: number | null }).deal_value ?? 0;
      pipelineSum += Number(val || 0);
    }
  }

  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

  return {
    customerCount: customerCount ?? 0,
    activeDealCount: activeCount,
    pipelineValue: pipelineSum,
    winRate,
    isOwnOnly,
  };
}

export default async function DashboardPage() {
  const user = await requireAuth();

  const hasAdminOrAll =
    user.permissions.includes('admin.system') || user.permissions.includes('crm.deals.read_all');
  const hasOwnOnly =
    !hasAdminOrAll &&
    (user.permissions.includes('crm.deals.read_own') ||
      user.permissions.includes('crm.customers.read_own') ||
      user.permissions.includes('crm.pipeline.view'));
  const hasCrmAccess = hasAdminOrAll || hasOwnOnly;
  const hasAdminStats =
    user.permissions.includes('admin.system') || user.permissions.includes('employees.read');

  const [systemStats, crmStats] = await Promise.all([
    hasAdminStats ? getSystemStats() : Promise.resolve(null),
    hasCrmAccess ? getCrmStats(user.employee.id, hasOwnOnly) : Promise.resolve(null),
  ]);

  const greeting = getGreeting();
  const primaryRole = user.roles[0]?.name ?? 'No Role';

  return (
    <div className="animate-fade-in">
      {/* Welcome Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
          borderRadius: '1rem',
          padding: '2rem 2.5rem',
          color: 'white',
          marginBottom: '1.5rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            right: '-40px',
            top: '-40px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'hsla(0 0% 100% / 0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '60px',
            bottom: '-60px',
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            background: 'hsla(0 0% 100% / 0.05)',
          }}
        />

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            position: 'relative',
          }}
        >
          {greeting}, {user.employee.full_name.split(' ')[0]}!
        </h1>
        <p
          style={{
            fontSize: '0.9375rem',
            opacity: 0.85,
            maxWidth: '500px',
            position: 'relative',
          }}
        >
          Welcome to the El-Exir Tourism Management System. You are signed in as{' '}
          <strong>{primaryRole}</strong>.
        </p>
      </div>

      {/* CRM Stats Grid (Shown to Sales, Admin, Accountant) */}
      {crmStats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'hsl(222 47% 11%)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Briefcase size={20} style={{ color: 'hsl(217 91% 50%)' }} />
            {crmStats.isOwnOnly ? 'My CRM Overview' : 'CRM Overview'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <StatCard
              icon={<UserCheck size={22} />}
              label={crmStats.isOwnOnly ? 'My Customers' : 'Total Customers'}
              value={crmStats.customerCount}
              color="hsl(217 91% 50%)"
              bgColor="hsla(217 91% 50% / 0.1)"
            />
            <StatCard
              icon={<Briefcase size={22} />}
              label={crmStats.isOwnOnly ? 'My Active Deals' : 'Active Deals'}
              value={crmStats.activeDealCount}
              color="hsl(262 83% 58%)"
              bgColor="hsla(262 83% 58% / 0.1)"
            />
            <StatCard
              icon={<DollarSign size={22} />}
              label={crmStats.isOwnOnly ? 'My Pipeline Value' : 'Pipeline Value'}
              value={formatCurrency(crmStats.pipelineValue)}
              color="hsl(142 71% 45%)"
              bgColor="hsla(142 71% 45% / 0.1)"
            />
            <StatCard
              icon={<TrendingUp size={22} />}
              label={crmStats.isOwnOnly ? 'My Win Rate' : 'Win Rate'}
              value={`${crmStats.winRate}%`}
              color="hsl(38 92% 50%)"
              bgColor="hsla(38 92% 50% / 0.1)"
            />
          </div>
        </div>
      )}

      {/* System Admin Stats Grid (Shown to Admin / HR) */}
      {systemStats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'hsl(222 47% 11%)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Shield size={20} style={{ color: 'hsl(262 83% 58%)' }} />
            System Administration
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <StatCard
              icon={<Users size={22} />}
              label="Employees"
              value={systemStats.employees}
              color="hsl(217 91% 50%)"
              bgColor="hsla(217 91% 50% / 0.1)"
            />
            <StatCard
              icon={<Shield size={22} />}
              label="Roles"
              value={systemStats.roles}
              color="hsl(262 83% 58%)"
              bgColor="hsla(262 83% 58% / 0.1)"
            />
            <StatCard
              icon={<Key size={22} />}
              label="Permissions"
              value={systemStats.permissions}
              color="hsl(142 71% 45%)"
              bgColor="hsla(142 71% 45% / 0.1)"
            />
            <StatCard
              icon={<Activity size={22} />}
              label="Audit Entries"
              value={systemStats.auditEntries}
              color="hsl(38 92% 50%)"
              bgColor="hsla(38 92% 50% / 0.1)"
            />
          </div>
        </div>
      )}

      {/* System Info Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Your Profile */}
        <div
          style={{
            background: 'white',
            borderRadius: '0.75rem',
            border: '1px solid hsl(220 13% 91%)',
            padding: '1.5rem',
          }}
        >
          <h2
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'hsl(222 47% 11%)',
              marginBottom: '1rem',
            }}
          >
            Your Profile
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Name" value={user.employee.full_name} />
            <InfoRow label="Email" value={user.employee.email} />
            <InfoRow label="Phone" value={user.employee.phone ?? 'Not set'} />
            <InfoRow label="Status" value={user.employee.is_active ? 'Active' : 'Inactive'} />
            <div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'hsl(220 8% 46%)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Roles
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: '0.375rem',
                  marginTop: '0.25rem',
                  flexWrap: 'wrap',
                }}
              >
                {user.roles.map((role) => (
                  <span
                    key={role.id}
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      borderRadius: '999px',
                      background: 'hsla(217 91% 50% / 0.1)',
                      color: 'hsl(217 91% 40%)',
                    }}
                  >
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div
          style={{
            background: 'white',
            borderRadius: '0.75rem',
            border: '1px solid hsl(220 13% 91%)',
            padding: '1.5rem',
          }}
        >
          <h2
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'hsl(222 47% 11%)',
              marginBottom: '1rem',
            }}
          >
            System Status
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <StatusRow label="Authentication" status="operational" />
            <StatusRow label="Database" status="operational" />
            <StatusRow label="RBAC" status="operational" />
            <StatusRow label="Audit Logging" status="operational" />
            <StatusRow label="CRM Module" status="operational" />
            <StatusRow label="Finance Module" status="pending" />
            <StatusRow label="HR Module" status="pending" />
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '0.75rem',
        border: '1px solid hsl(220 13% 91%)',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '0.75rem',
          background: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'hsl(222 47% 11%)',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'hsl(220 8% 46%)',
            marginTop: '2px',
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'hsl(220 8% 46%)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'hsl(222 47% 11%)',
          marginTop: '2px',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: 'operational' | 'pending' | 'error';
}) {
  const statusConfig = {
    operational: {
      color: 'hsl(142 71% 45%)',
      bgColor: 'hsla(142 71% 45% / 0.1)',
      label: 'Operational',
    },
    pending: {
      color: 'hsl(220 8% 46%)',
      bgColor: 'hsla(220 8% 46% / 0.1)',
      label: 'Phase 2+',
    },
    error: {
      color: 'hsl(0 72% 51%)',
      bgColor: 'hsla(0 72% 51% / 0.1)',
      label: 'Error',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontSize: '0.875rem',
          color: 'hsl(222 47% 11%)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '2px 10px',
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: '999px',
          background: config.bgColor,
          color: config.color,
        }}
      >
        {status === 'operational' && (
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: config.color,
            }}
          />
        )}
        {config.label}
      </span>
    </div>
  );
}
