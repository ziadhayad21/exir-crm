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
            background: 'hsla(142 71% 45% / 0.1)',
            border: '1px solid hsla(142 71% 45% / 0.2)',
            borderRadius: '0.5rem',
            color: 'hsl(142 71% 30%)',
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
            background: 'hsla(0 72% 51% / 0.1)',
            border: '1px solid hsla(0 72% 51% / 0.2)',
            borderRadius: '0.5rem',
            color: 'hsl(0 72% 40%)',
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
            background: 'white',
            border: '1px solid hsl(220 13% 91%)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
          }}
        >
          <Search size={18} style={{ color: 'hsl(220 8% 46%)', flexShrink: 0 }} />
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
              color: 'hsl(222 47% 11%)',
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
            background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px hsla(217 91% 50% / 0.3)',
            transition: 'opacity 0.15s, transform 0.1s',
          }}
        >
          <Plus size={18} />
          Add Employee
        </button>
      </div>

      {/* Employees Table */}
      <div
        style={{
          background: 'white',
          borderRadius: '0.75rem',
          border: '1px solid hsl(220 13% 91%)',
          overflow: 'hidden',
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
                color: 'hsl(220 13% 85%)',
                margin: '0 auto 1rem',
              }}
            />
            <p
              style={{
                fontSize: '0.9375rem',
                fontWeight: 500,
                color: 'hsl(220 8% 46%)',
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
                    borderBottom: '1px solid hsl(220 13% 91%)',
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
                          color: 'hsl(220 8% 46%)',
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
                      borderBottom: '1px solid hsl(220 14% 96%)',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'hsl(220 14% 98%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td
                      style={{
                        padding: '0.875rem 1rem',
                        fontWeight: 500,
                        color: 'hsl(222 47% 11%)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: emp.is_active
                              ? 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)'
                              : 'hsl(220 13% 85%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
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
                        color: 'hsl(220 8% 46%)',
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
                                background: 'hsla(217 91% 50% / 0.1)',
                                color: 'hsl(217 91% 40%)',
                              }}
                            >
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              color: 'hsl(220 8% 70%)',
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
                          background: emp.is_active
                            ? 'hsla(142 71% 45% / 0.1)'
                            : 'hsla(0 72% 51% / 0.1)',
                          color: emp.is_active
                            ? 'hsl(142 71% 30%)'
                            : 'hsl(0 72% 40%)',
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: emp.is_active
                              ? 'hsl(142 71% 45%)'
                              : 'hsl(0 72% 51%)',
                          }}
                        />
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.875rem 1rem',
                        color: 'hsl(220 8% 46%)',
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
                            borderRadius: '0.375rem',
                            border: '1px solid hsl(220 13% 91%)',
                            background: 'white',
                            color: 'hsl(217 91% 50%)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'hsla(217 91% 50% / 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white';
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
                            borderRadius: '0.375rem',
                            border: '1px solid hsl(220 13% 91%)',
                            background: 'white',
                            color: emp.is_active
                              ? 'hsl(0 72% 51%)'
                              : 'hsl(142 71% 45%)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = emp.is_active
                              ? 'hsla(0 72% 51% / 0.05)'
                              : 'hsla(142 71% 45% / 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white';
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
                background: 'hsla(0 72% 51% / 0.1)',
                border: '1px solid hsla(0 72% 51% / 0.2)',
                borderRadius: '0.375rem',
                color: 'hsl(0 72% 40%)',
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
                    color: 'hsl(222 47% 11%)',
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
                    border: '1px solid hsl(220 13% 91%)',
                    borderRadius: '0.5rem',
                    background: 'white',
                    color: 'hsl(222 47% 11%)',
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
                  <p style={{ color: 'hsl(0 72% 51%)', fontSize: '0.75rem', marginTop: '4px' }}>
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
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(220 13% 91%)',
                  background: 'white',
                  color: 'hsl(222 47% 11%)',
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
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                  color: 'white',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
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
                background: 'hsla(0 72% 51% / 0.1)',
                border: '1px solid hsla(0 72% 51% / 0.2)',
                borderRadius: '0.375rem',
                color: 'hsl(0 72% 40%)',
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
                color: 'hsl(220 8% 46%)',
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
                  color: 'hsl(222 47% 11%)',
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
                  border: '1px solid hsl(220 13% 91%)',
                  borderRadius: '0.5rem',
                  background: 'white',
                  color: 'hsl(222 47% 11%)',
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
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(220 13% 91%)',
                  background: 'white',
                  color: 'hsl(222 47% 11%)',
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
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                  color: 'white',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
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
          background: 'hsla(0 0% 0% / 0.5)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal content */}
      <div
        className="animate-fade-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          background: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 24px 48px hsla(0 0% 0% / 0.15)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid hsl(220 13% 91%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3
            style={{
              fontSize: '1.0625rem',
              fontWeight: 600,
              color: 'hsl(222 47% 11%)',
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
              color: 'hsl(220 8% 46%)',
              display: 'flex',
              padding: '4px',
              borderRadius: '0.25rem',
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
          color: 'hsl(222 47% 11%)',
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
          border: '1px solid hsl(220 13% 91%)',
          borderRadius: '0.5rem',
          color: 'hsl(222 47% 11%)',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'hsl(217 91% 50%)';
          e.currentTarget.style.boxShadow = '0 0 0 3px hsla(217 91% 50% / 0.1)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'hsl(220 13% 91%)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
