// src/app/(dashboard)/admin/employees/employees-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEmployee, toggleEmployeeStatus, assignRole } from '../actions';
import { formatDate } from '@/lib/utils';
import type { EmployeeWithRoles, Role } from '@/types';
import {
  Plus,
  UserCheck,
  UserX,
  Shield,
  X,
  Loader2,
  Search,
  Users,
} from 'lucide-react';

interface EmployeesClientProps {
  employees: EmployeeWithRoles[];
  roles: Role[];
}

export function EmployeesClient({ employees, roles }: EmployeesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmployees = employees.filter((emp) =>
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleCreateEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createEmployee(formData);
      if (result.success) {
        setShowCreateModal(false);
        setSuccess('Employee created successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to create employee');
      }
    });
  }

  function handleToggleStatus(employeeId: string, currentlyActive: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set('employee_id', employeeId);
    formData.set('is_active', String(!currentlyActive));

    startTransition(async () => {
      const result = await toggleEmployeeStatus(formData);
      if (result.success) {
        setSuccess(`Employee ${currentlyActive ? 'deactivated' : 'activated'} successfully`);
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update status');
      }
    });
  }

  function handleAssignRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await assignRole(formData);
      if (result.success) {
        setShowRoleModal(null);
        setSuccess('Role assigned successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to assign role');
      }
    });
  }

  return (
    <div>
      {/* Messages */}
      {success && (
        <div
          className="animate-fade-in"
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--success)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius)',
            color: 'var(--success-foreground)',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && !showCreateModal && !showRoleModal && (
        <div
          className="animate-fade-in"
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--destructive)',
            border: '1px solid var(--destructive-border)',
            borderRadius: 'var(--radius)',
            color: 'var(--destructive-foreground)',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1,
            maxWidth: '400px',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '0.5rem 0.75rem',
          }}
        >
          <Search size={18} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              background: 'transparent',
              color: 'var(--foreground)',
            }}
          />
        </div>

        <button
          onClick={() => {
            setError(null);
            setShowCreateModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1rem',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            border: '1px solid rgba(174, 172, 120, 0.4)',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary)';
          }}
        >
          <Plus size={18} />
          Add Employee
        </button>
      </div>

      {/* Employees Table */}
      <div
        style={{
          backgroundColor: 'var(--card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
        }}
      >
        {filteredEmployees.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
            }}
          >
            <Users
              size={48}
              style={{
                color: 'var(--olive)',
                opacity: 0.5,
                margin: '0 auto 1rem',
              }}
            />
            <p
              style={{
                fontSize: '0.9375rem',
                fontWeight: 500,
                color: 'var(--muted-foreground)',
              }}
            >
              {searchQuery ? 'No employees match your search.' : 'No employees found.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--surface-muted)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {['Name', 'Email', 'Roles', 'Status', 'Created', 'Actions'].map(
                    (header) => (
                      <th
                        key={header}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          color: 'var(--muted-foreground)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: '1px solid rgba(174, 172, 120, 0.15)',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td
                      style={{
                        padding: '0.875rem 1rem',
                        fontWeight: 500,
                        color: 'var(--foreground)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: emp.is_active
                              ? 'var(--primary)'
                              : 'var(--muted)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: emp.is_active
                              ? 'var(--primary-foreground)'
                              : 'var(--muted-foreground)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {emp.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        {emp.full_name}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '0.875rem 1rem',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      {emp.email}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {emp.roles.length > 0 ? (
                          emp.roles.map((role) => (
                            <span
                              key={role.id}
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                fontSize: '0.6875rem',
                                fontWeight: 500,
                                borderRadius: '999px',
                                backgroundColor: 'var(--accent)',
                                color: 'var(--foreground)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--muted-foreground)',
                              fontStyle: 'italic',
                            }}
                          >
                            No role
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '2px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          borderRadius: '999px',
                          backgroundColor: emp.is_active
                            ? 'var(--success)'
                            : 'var(--destructive)',
                          border: `1px solid ${emp.is_active ? 'var(--success-border)' : 'var(--destructive-border)'}`,
                          color: emp.is_active
                            ? 'var(--success-foreground)'
                            : 'var(--destructive-foreground)',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: emp.is_active
                              ? 'var(--success-foreground)'
                              : 'var(--destructive-foreground)',
                          }}
                        />
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.875rem 1rem',
                        color: 'var(--muted-foreground)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(emp.created_at)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button
                          onClick={() => {
                            setError(null);
                            setShowRoleModal(emp.id);
                          }}
                          disabled={isPending}
                          title="Assign Role"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--surface)',
                            color: 'var(--foreground)',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface)';
                          }}
                        >
                          <Shield size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(emp.id, emp.is_active)}
                          disabled={isPending}
                          title={emp.is_active ? 'Deactivate' : 'Activate'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--surface)',
                            color: emp.is_active
                              ? 'var(--destructive-foreground)'
                              : 'var(--success-foreground)',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface)';
                          }}
                        >
                          {emp.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Employee Modal */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)} title="Add New Employee">
          {error && (
            <div
              style={{
                padding: '0.625rem 0.875rem',
                backgroundColor: 'var(--destructive)',
                border: '1px solid var(--destructive-border)',
                borderRadius: 'var(--radius)',
                color: 'var(--destructive-foreground)',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleCreateEmployee}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField label="Full Name" name="full_name" required />
              <FormField label="Email" name="email" type="email" required />
              <FormField label="Phone" name="phone" />
              <FormField
                label="Password"
                name="password"
                type="password"
                required
                minLength={8}
              />
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--foreground)',
                    marginBottom: '0.375rem',
                  }}
                >
                  Role *
                </label>
                <select
                  name="role_id"
                  required
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    fontSize: '0.875rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--foreground)',
                    outline: 'none',
                  }}
                >
                  <option value="" disabled>Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {roles.length === 0 && (
                  <p style={{ color: 'var(--destructive-foreground)', fontSize: '0.75rem', marginTop: '4px' }}>
                    No roles found. Please refresh the page.
                  </p>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                  boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                }}
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Create Employee
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assign Role Modal */}
      {showRoleModal && (
        <Modal
          onClose={() => setShowRoleModal(null)}
          title="Assign Role"
        >
          {error && (
            <div
              style={{
                padding: '0.625rem 0.875rem',
                backgroundColor: 'var(--destructive)',
                border: '1px solid var(--destructive-border)',
                borderRadius: 'var(--radius)',
                color: 'var(--destructive-foreground)',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleAssignRole}>
            <input type="hidden" name="employee_id" value={showRoleModal} />
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--muted-foreground)',
                marginBottom: '1rem',
              }}
            >
              This will replace any existing roles for the employee.
            </p>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  marginBottom: '0.375rem',
                }}
              >
                Role
              </label>
              <select
                name="role_id"
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--foreground)',
                  outline: 'none',
                }}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} — {role.description}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => setShowRoleModal(null)}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                  boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                }}
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Assign Role
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Reusable Components ─────────────────────────────────────────

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(76, 69, 65, 0.4)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Modal content */}
      <div
        className="animate-fade-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12), 0 8px 10px -6px rgba(76, 69, 65, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface-muted)',
          }}
        >
          <h3
            style={{
              fontSize: '1.0625rem',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              display: 'flex',
              padding: '4px',
              borderRadius: 'var(--radius)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.5rem' }}>{children}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  type = 'text',
  required = false,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        style={{
          display: 'block',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: 'var(--foreground)',
          marginBottom: '0.375rem',
        }}
      >
        {label} {required && '*'}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        style={{
          width: '100%',
          padding: '0.625rem 0.75rem',
          fontSize: '0.875rem',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--foreground)',
          backgroundColor: 'var(--surface)',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.boxShadow = '0 0 0 2px var(--ring)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
