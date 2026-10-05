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
            color: 'hsl(222 47% 11%)',
          }}
        >
          Permissions
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'hsl(220 8% 46%)',
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
              background: 'white',
              borderRadius: '0.75rem',
              border: '1px solid hsl(220 13% 91%)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid hsl(220 14% 96%)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
              }}
            >
              <Key size={18} style={{ color: 'hsl(217 91% 50%)' }} />
              <h2
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: 'hsl(222 47% 11%)',
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
                  color: 'hsl(220 8% 46%)',
                  background: 'hsl(220 14% 96%)',
                  padding: '2px 8px',
                  borderRadius: '999px',
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
                    borderBottom: '1px solid hsl(220 14% 97%)',
                  }}
                >
                  <code
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'hsl(262 83% 50%)',
                      background: 'hsla(262 83% 58% / 0.06)',
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
                      color: 'hsl(220 8% 46%)',
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
