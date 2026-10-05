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
            color: 'hsl(222 47% 11%)',
          }}
        >
          Roles
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'hsl(220 8% 46%)',
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
              background: 'white',
              borderRadius: '0.75rem',
              border: '1px solid hsl(220 13% 91%)',
              padding: '1.25rem',
              transition: 'box-shadow 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '0.625rem',
                  background: 'hsla(217 91% 50% / 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'hsl(217 91% 50%)',
                  flexShrink: 0,
                }}
              >
                <Shield size={20} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: 'hsl(222 47% 11%)',
                  }}
                >
                  {role.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'hsl(220 8% 46%)',
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
