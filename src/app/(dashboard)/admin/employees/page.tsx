// src/app/(dashboard)/admin/employees/page.tsx
// Admin employees management page

import { getEmployees, getRoles } from '../actions';
import { EmployeesClient } from './employees-client';

export default async function EmployeesPage() {
  const [employees, roles] = await Promise.all([
    getEmployees(),
    getRoles(),
  ]);

  return (
    <div className="animate-fade-in">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
            }}
          >
            Employee Management
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--muted-foreground)',
              marginTop: '0.25rem',
            }}
          >
            Manage system users, assign roles, and control access.
          </p>
        </div>
      </div>

      <EmployeesClient employees={employees} roles={roles} />
    </div>
  );
}
