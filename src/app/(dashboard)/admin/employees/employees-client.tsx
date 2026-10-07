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
  UserPlus,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  User,
  ChevronDown,
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
  const [showPassword, setShowPassword] = useState(false);

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
        <Modal
          onClose={() => {
            setShowCreateModal(false);
            setShowPassword(false);
          }}
          title="Add New Employee"
          subtitle="Create credentials and assign a system role for the employee."
          icon={<UserPlus size={20} />}
        >
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--destructive)',
                border: '1px solid var(--destructive-border)',
                borderRadius: '10px',
                color: 'var(--destructive-foreground)',
                fontSize: '0.8125rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleCreateEmployee}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
              {/* Row 1: Full Name */}
              <FormField
                label="Full Name"
                name="full_name"
                required
                placeholder="e.g. Sara Ahmed"
                icon={<User size={16} />}
              />

              {/* Row 2: Email & Phone (Responsive 2-col) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '1rem',
                }}
              >
                <FormField
                  label="Email Address"
                  name="email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  icon={<Mail size={16} />}
                />
                <FormField
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  optional
                  placeholder="+20 100 000 0000"
                  icon={<Phone size={16} />}
                />
              </div>

              {/* Row 3: Password & Role (Responsive 2-col) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '1rem',
                }}
              >
                <FormField
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  icon={<Lock size={16} />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted-foreground)',
                        display: 'flex',
                        padding: '6px',
                        borderRadius: '6px',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--foreground)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--muted-foreground)';
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />

                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.375rem',
                    }}
                  >
                    <label
                      htmlFor="role_id"
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Role <span style={{ color: 'var(--gold)', fontWeight: 700 }}>*</span>
                    </label>
                  </div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted-foreground)',
                        pointerEvents: 'none',
                      }}
                    >
                      <Shield size={16} />
                    </div>
                    <select
                      id="role_id"
                      name="role_id"
                      required
                      defaultValue=""
                      style={{
                        width: '100%',
                        height: '42px',
                        paddingInlineStart: '2.5rem',
                        paddingInlineEnd: '2.25rem',
                        fontSize: '0.875rem',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--foreground)',
                        outline: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(242, 196, 106, 0.35)';
                        e.currentTarget.style.backgroundColor = 'var(--card)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.backgroundColor = 'var(--surface)';
                      }}
                    >
                      <option value="" disabled>Select a role...</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted-foreground)',
                        pointerEvents: 'none',
                      }}
                    >
                      <ChevronDown size={16} />
                    </div>
                  </div>
                  {roles.length === 0 && (
                    <p style={{ color: 'var(--destructive-foreground)', fontSize: '0.75rem', marginTop: '4px' }}>
                      No roles found. Please refresh the page.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setShowPassword(false);
                }}
                style={{
                  height: '42px',
                  padding: '0 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  transition: 'transform 0.1s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isPending) {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(242, 196, 106, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isPending) {
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(76, 69, 65, 0.08)';
                  }
                }}
              >
                {isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <UserPlus size={16} />
                )}
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
          subtitle="Update the assigned role and permissions for this user."
          icon={<Shield size={20} />}
        >
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--destructive)',
                border: '1px solid var(--destructive-border)',
                borderRadius: '10px',
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
              This will replace any existing roles assigned to this employee.
            </p>
            <div>
              <label
                htmlFor="assign_role_id"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  marginBottom: '0.375rem',
                }}
              >
                System Role <span style={{ color: 'var(--gold)', fontWeight: 700 }}>*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--muted-foreground)',
                    pointerEvents: 'none',
                  }}
                >
                  <Shield size={16} />
                </div>
                <select
                  id="assign_role_id"
                  name="role_id"
                  required
                  defaultValue=""
                  style={{
                    width: '100%',
                    height: '42px',
                    paddingInlineStart: '2.5rem',
                    paddingInlineEnd: '2.25rem',
                    fontSize: '0.875rem',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--foreground)',
                    outline: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(242, 196, 106, 0.35)';
                    e.currentTarget.style.backgroundColor = 'var(--card)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                  }}
                >
                  <option value="" disabled>Select a role...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} — {role.description ?? 'Full permissions'}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--muted-foreground)',
                    pointerEvents: 'none',
                  }}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowRoleModal(null)}
                style={{
                  height: '42px',
                  padding: '0 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  borderRadius: '10px',
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
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                }}
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Save Role
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
  subtitle,
  icon,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
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
        padding: '1.5rem 1rem',
        overflowY: 'auto',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(76, 69, 65, 0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal Card */}
      <div
        className="animate-fade-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '540px',
          margin: 'auto',
          maxHeight: 'min(92vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 40px -8px rgba(76, 69, 65, 0.22), 0 0 0 1px rgba(174, 172, 120, 0.2)',
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
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            {icon && (
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(242, 196, 106, 0.25)',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--foreground)',
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
            )}
            <div>
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h3>
              {subtitle && (
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--muted-foreground)',
                    marginTop: '2px',
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              display: 'flex',
              padding: '6px',
              borderRadius: '8px',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--hover)';
              e.currentTarget.style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--muted-foreground)';
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>{children}</div>
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
  placeholder,
  icon,
  rightElement,
  optional = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.375rem',
        }}
      >
        <label
          htmlFor={name}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--foreground)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {label}
          {required && (
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>*</span>
          )}
        </label>
        {optional && (
          <span
            style={{
              fontSize: '0.6875rem',
              color: 'var(--muted-foreground)',
              backgroundColor: 'var(--surface-muted)',
              padding: '1px 6px',
              borderRadius: '999px',
              border: '1px solid var(--border)',
            }}
          >
            Optional
          </span>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <div
            style={{
              position: 'absolute',
              left: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted-foreground)',
              pointerEvents: 'none',
            }}
          >
            {icon}
          </div>
        )}
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          style={{
            width: '100%',
            height: '42px',
            paddingInlineStart: icon ? '2.5rem' : '0.875rem',
            paddingInlineEnd: rightElement ? '2.5rem' : '0.875rem',
            fontSize: '0.875rem',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--foreground)',
            backgroundColor: 'var(--surface)',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-strong)';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(242, 196, 106, 0.35)';
            e.currentTarget.style.backgroundColor = 'var(--card)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.backgroundColor = 'var(--surface)';
          }}
        />
        {rightElement && (
          <div
            style={{
              position: 'absolute',
              right: '0.5rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
}
