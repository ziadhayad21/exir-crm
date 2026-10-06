// src/app/(dashboard)/admin/roles/page.tsx
// Admin roles view page

import { getRoles } from '../actions';
import { Shield } from 'lucide-react';

export default async function RolesPage() {
  const roles = await getRoles();

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
          Roles
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)',
            marginTop: '0.25rem',
          }}
        >
          View system roles. Role management will be expanded in future phases.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {roles.map((role) => (
          <div
            key={role.id}
            style={{
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'rgba(242, 196, 106, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--foreground)',
                  flexShrink: 0,
                  border: '1px solid var(--border)',
                }}
              >
                <Shield size={20} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: 'var(--foreground)',
                  }}
                >
                  {role.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--muted-foreground)',
                    marginTop: '2px',
                  }}
                >
                  {role.description ?? 'No description'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
