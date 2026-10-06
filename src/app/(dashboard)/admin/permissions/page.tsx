// src/app/(dashboard)/admin/permissions/page.tsx
// Admin permissions view page

import { getPermissions } from '../actions';
import { Key } from 'lucide-react';

export default async function PermissionsPage() {
  const permissions = await getPermissions();

  // Group by module
  const grouped = permissions.reduce<Record<string, typeof permissions>>(
    (acc, perm) => {
      const moduleName = perm.module;
      if (!acc[moduleName]) acc[moduleName] = [];
      acc[moduleName].push(perm);
      return acc;
    },
    {},
  );

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
          }}
        >
          Permissions
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)',
            marginTop: '0.25rem',
          }}
        >
          View system permissions grouped by module. More permissions will be added in future phases.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {Object.entries(grouped).map(([module, perms]) => (
          <div
            key={module}
            style={{
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
            }}
          >
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                backgroundColor: 'var(--surface-muted)',
              }}
            >
              <Key size={18} style={{ color: 'var(--olive)' }} />
              <h2
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  textTransform: 'capitalize',
                }}
              >
                {module}
              </h2>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  backgroundColor: 'var(--accent)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                }}
              >
                {perms.length} permissions
              </span>
            </div>
            <div style={{ padding: '0.75rem 1.25rem' }}>
              {perms.map((perm) => (
                <div
                  key={perm.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid rgba(174, 172, 120, 0.15)',
                  }}
                >
                  <code
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      backgroundColor: 'var(--muted)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
                      borderRadius: '0.25rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {perm.key}
                  </code>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {perm.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
