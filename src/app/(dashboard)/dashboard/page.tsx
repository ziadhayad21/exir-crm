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

  let leadsQuery = adminClient.from('leads').select('status, total_amount, paid_amount');
  if (isOwnOnly) {
    leadsQuery = leadsQuery.eq('assigned_to', employeeId);
  }

  const [{ count: customerCount }, { data: leads, error: leadsError }] = await Promise.all([
    customerQuery,
    leadsQuery,
  ]);

  if (leadsError || !leads) {
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

  for (const lead of leads) {
    if (lead.status === 'won') {
      wonCount++;
      pipelineSum += Number(lead.total_amount || 0);
    } else if (lead.status === 'lose') {
      lostCount++;
    } else {
      activeCount++;
      pipelineSum += Number(lead.total_amount || 0);
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

  const hasCrmAccess =
    user.permissions.includes('crm.deals.read_all') ||
    user.permissions.includes('crm.deals.read_own') ||
    user.permissions.includes('crm.customers.read_all') ||
    user.permissions.includes('crm.customers.read_own');

  const hasOwnOnly =
    !user.permissions.includes('crm.deals.read_all') &&
    !user.permissions.includes('crm.customers.read_all');

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
          background: 'linear-gradient(135deg, var(--card) 0%, var(--surface-muted) 100%)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '2rem 2.5rem',
          color: 'var(--foreground)',
          marginBottom: '1.5rem',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(76, 69, 65, 0.04)',
        }}
      >
        {/* Soft decorative glow */}
        <div
          style={{
            position: 'absolute',
            right: '-30px',
            top: '-30px',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(242, 196, 106, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            position: 'relative',
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          {greeting}, {user.employee.full_name.split(' ')[0]}!
        </h1>
        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--muted-foreground)',
            maxWidth: '520px',
            position: 'relative',
            lineHeight: 1.5,
          }}
        >
          Welcome to the El-Exir Tourism Management System. You are signed in as{' '}
          <strong style={{ color: 'var(--foreground)' }}>{primaryRole}</strong>.
        </p>
      </div>

      {/* CRM Stats Grid (Shown to Sales, Admin, Accountant) */}
      {crmStats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--foreground)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Briefcase size={20} style={{ color: 'var(--olive)' }} />
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
              color="var(--foreground)"
              bgColor="rgba(242, 196, 106, 0.25)"
            />
            <StatCard
              icon={<Briefcase size={22} />}
              label={crmStats.isOwnOnly ? 'My Active Sales Leads' : 'Active Sales Leads'}
              value={crmStats.activeDealCount}
              color="var(--foreground)"
              bgColor="rgba(174, 172, 120, 0.25)"
            />
            <StatCard
              icon={<DollarSign size={22} />}
              label={crmStats.isOwnOnly ? 'My Pipeline Value' : 'Pipeline Value'}
              value={formatCurrency(crmStats.pipelineValue)}
              color="var(--success-foreground)"
              bgColor="var(--success)"
            />
            <StatCard
              icon={<TrendingUp size={22} />}
              label={crmStats.isOwnOnly ? 'My Win Rate' : 'Win Rate'}
              value={`${crmStats.winRate}%`}
              color="var(--warning-foreground)"
              bgColor="var(--warning)"
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
              color: 'var(--foreground)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Shield size={20} style={{ color: 'var(--olive)' }} />
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
              color="var(--foreground)"
              bgColor="rgba(242, 196, 106, 0.25)"
            />
            <StatCard
              icon={<Shield size={22} />}
              label="Roles"
              value={systemStats.roles}
              color="var(--foreground)"
              bgColor="rgba(174, 172, 120, 0.25)"
            />
            <StatCard
              icon={<Key size={22} />}
              label="Permissions"
              value={systemStats.permissions}
              color="var(--success-foreground)"
              bgColor="var(--success)"
            />
            <StatCard
              icon={<Activity size={22} />}
              label="Audit Entries"
              value={systemStats.auditEntries}
              color="var(--warning-foreground)"
              bgColor="var(--warning)"
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
            backgroundColor: 'var(--card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
          }}
        >
          <h2
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--foreground)',
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
                  color: 'var(--muted-foreground)',
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
                      backgroundColor: 'var(--accent)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
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
            backgroundColor: 'var(--card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
          }}
        >
          <h2
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--foreground)',
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
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
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
          border: '1px solid var(--border)',
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--foreground)',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--muted-foreground)',
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
          color: 'var(--muted-foreground)',
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
          color: 'var(--foreground)',
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
      color: 'var(--success-foreground)',
      bgColor: 'var(--success)',
      borderColor: 'var(--success-border)',
      label: 'Operational',
    },
    pending: {
      color: 'var(--muted-foreground)',
      bgColor: 'var(--muted)',
      borderColor: 'var(--border)',
      label: 'Phase 2+',
    },
    error: {
      color: 'var(--destructive-foreground)',
      bgColor: 'var(--destructive)',
      borderColor: 'var(--destructive-border)',
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
          color: 'var(--foreground)',
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
          border: `1px solid ${config.borderColor}`,
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
