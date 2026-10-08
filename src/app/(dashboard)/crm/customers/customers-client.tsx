// src/app/(dashboard)/crm/customers/customers-client.tsx
'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCustomer, updateCustomer, softDeleteCustomer } from '../actions';
import { formatDate } from '@/lib/utils';
import type { Customer, CurrentUser, Lead } from '@/types';
import { hasPermission } from '@/lib/auth/client-helpers';
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select';
import {
  Plus,
  Users,
  Search,
  Eye,
  Edit2,
  Trash2,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Mail,
  Phone,
  FileDown,
  UploadCloud,
} from 'lucide-react';
import {
  exportCustomersExcel,
  validateCustomersImportExcel,
  executeCustomersImportExcel,
  getCustomerExcelTemplate,
} from '../excel-actions';
import { ExcelImportModal } from '@/components/excel-import-modal';

interface CustomersClientProps {
  customers: Customer[];
  leads?: Lead[];
  user: CurrentUser;
}

export function CustomersClient({ customers, leads = [], user }: CustomersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Excel Import / Export state
  const [isExporting, setIsExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Strict deduplication warning state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    duplicates: Customer[];
  } | null>(null);

  // Link to existing Lead state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [createFormData, setCreateFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    notes: '',
  });

  // Real-time check while typing: detect if phone or email matches an existing customer
  const duplicateMatch = useMemo(() => {
    const trimmedPhone = createFormData.phone.trim();
    const trimmedEmail = createFormData.email.trim().toLowerCase();
    if (!trimmedPhone && !trimmedEmail) return null;

    return (customers || []).find((c) => {
      const matchPhone = Boolean(trimmedPhone && c.phone && c.phone.trim() === trimmedPhone);
      const matchEmail = Boolean(trimmedEmail && c.email && c.email.trim().toLowerCase() === trimmedEmail);
      return matchPhone || matchEmail;
    }) || null;
  }, [createFormData.phone, createFormData.email, customers]);

  const leadOptions: SearchableOption[] = useMemo(() => {
    return (leads || []).map((l) => ({
      id: l.id,
      title: l.full_name,
      subtitle: l.phone || 'No phone',
      badge: l.status.replace('_', ' ').toUpperCase(),
      badgeStyle: {
        bg: l.status === 'won' ? 'rgba(34, 197, 94, 0.12)' : l.status === 'lose' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
        text: l.status === 'won' ? '#16a34a' : l.status === 'lose' ? '#dc2626' : '#2563eb',
        border: 'transparent',
      },
      detail: l.email ? `Email: ${l.email}` : `Lead ID: ${l.id.slice(0, 8)}...`,
      meta: l,
    }));
  }, [leads]);

  const handleLeadSelect = (leadId: string | null, option?: SearchableOption | null) => {
    setSelectedLeadId(leadId);
    if (option?.meta) {
      const lead = option.meta as Lead;
      setCreateFormData({
        full_name: lead.full_name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        notes: lead.notes || '',
      });
    }
  };

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canWrite = hasPermission(user, 'crm.customers.write');
  const hasReadAll = hasPermission(user, 'crm.customers.read_all');

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;

    const matchesName = c.full_name.toLowerCase().includes(q);
    const matchesEmail = Boolean(c.email && c.email.toLowerCase().includes(q));
    const matchesPhone = Boolean(c.phone && c.phone.includes(q));
    const matchesNotes = Boolean(c.notes && c.notes.toLowerCase().includes(q));

    return matchesName || matchesEmail || matchesPhone || matchesNotes;
  });

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDuplicateWarning(null);

    // Immediate client-side duplicate check
    if (duplicateMatch) {
      const matchField = duplicateMatch.phone === createFormData.phone.trim() ? 'phone number' : 'email';
      setDuplicateWarning({
        message: `A customer with this ${matchField} already exists (${duplicateMatch.full_name}). Creating duplicate customer records is strictly blocked.`,
        duplicates: [duplicateMatch],
      });
      return;
    }

    const formData = new FormData(e.currentTarget);
    if (selectedLeadId) {
      formData.set('lead_id', selectedLeadId);
    }
    formData.set('full_name', createFormData.full_name);
    formData.set('phone', createFormData.phone);
    formData.set('email', createFormData.email);
    formData.set('notes', createFormData.notes);

    startTransition(async () => {
      const result = await createCustomer(formData);
      if (result.success) {
        setShowCreateModal(false);
        setSelectedLeadId(null);
        setCreateFormData({ full_name: '', phone: '', email: '', notes: '' });
        setDuplicateWarning(null);
        setSuccess('Customer created successfully and linked to Lead!');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else if (result.duplicates && result.duplicates.length > 0) {
        // Strict duplicate blocked by server
        setDuplicateWarning({
          message: result.error || 'A customer with this phone number or email already exists.',
          duplicates: result.duplicates,
        });
      } else {
        setError(result.error ?? 'Failed to create customer');
      }
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateCustomer(formData);
      if (result.success) {
        setEditingCustomer(null);
        setSuccess('Customer updated successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update customer');
      }
    });
  }

  function handleDelete() {
    if (!deletingCustomer) return;
    setError(null);
    const formData = new FormData();
    formData.set('id', deletingCustomer.id);

    startTransition(async () => {
      const result = await softDeleteCustomer(formData);
      if (result.success) {
        setDeletingCustomer(null);
        setSuccess('Customer deleted successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to delete customer');
      }
    });
  }

  function handleExport() {
    setIsExporting(true);
    startTransition(async () => {
      try {
        const res = await exportCustomersExcel();
        if (!res.success || !res.base64) {
          setError(res.error || 'Failed to export customers');
          return;
        }

        const byteCharacters = atob(res.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || 'Customers_Report.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setSuccess(`Exported ${res.rowCount} customers successfully.`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Export failed');
      } finally {
        setIsExporting(false);
      }
    });
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', color: 'var(--foreground)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={24} style={{ color: 'var(--olive)' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
              Customers
            </h1>
          </div>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Manage customer contacts, profiles, and relationships.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          {/* Generate Report Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1rem',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface)',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: '1px solid var(--border)',
              cursor: isExporting ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(76, 69, 65, 0.05)',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            Generate Report
          </button>

          {/* Import Report Button */}
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(76, 69, 65, 0.05)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--muted)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface)';
              }}
            >
              <UploadCloud size={16} />
              Import Report
            </button>
          )}

          {canWrite && (
            <button
              type="button"
              id="create-customer-button"
              onClick={() => {
                setDuplicateWarning(null);
                setShowCreateModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: '1px solid rgba(174, 172, 120, 0.4)',
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
              <Plus size={16} />
              Create Customer
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--success)',
            border: '1px solid var(--success-border)',
            color: 'var(--success-foreground)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <Check size={16} />
          {success}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--destructive)',
            border: '1px solid var(--destructive-border)',
            color: 'var(--destructive-foreground)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '0.5rem 0.75rem',
            maxWidth: '360px',
            flex: 1,
            boxShadow: '0 1px 2px rgba(76, 69, 65, 0.03)',
          }}
        >
          <Search size={16} style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              outline: 'none',
              width: '100%',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-muted)' }}>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Full Name
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Phone
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Email
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Notes
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Created At
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                  {searchQuery ? 'No customers match your search.' : 'No customers found.'}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => {
                const canModify = canWrite && (customer.created_by === user.employee.id || hasReadAll);

                return (
                  <tr
                    key={customer.id}
                    style={{
                      borderBottom: '1px solid rgba(174, 172, 120, 0.15)',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Link
                        href={`/crm/customers/${customer.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'var(--foreground)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent)',
                            color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          {customer.full_name.charAt(0).toUpperCase()}
                        </div>
                        {customer.full_name}
                      </Link>
                    </td>

                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--foreground)' }}>
                      {customer.phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Phone size={13} style={{ color: 'var(--olive)' }} />
                          <span>{customer.phone}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--foreground)' }}>
                      {customer.email ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Mail size={13} style={{ color: 'var(--olive)' }} />
                          <span>{customer.email}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)', maxWidth: '220px' }}>
                      {customer.notes ? (
                        <span
                          title={customer.notes}
                          style={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {customer.notes}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                      {formatDate(customer.created_at)}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                        <Link
                          href={`/crm/customers/${customer.id}`}
                          style={{
                            padding: '0.375rem',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--surface)',
                            color: 'var(--foreground)',
                            display: 'inline-flex',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                          title="View Customer Details"
                        >
                          <Eye size={14} />
                        </Link>

                        {canModify && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingCustomer(customer)}
                              style={{
                                padding: '0.375rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--surface)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                              title="Edit Customer"
                            >
                              <Edit2 size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingCustomer(customer)}
                              style={{
                                padding: '0.375rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--destructive-border)',
                                backgroundColor: 'var(--surface)',
                                color: 'var(--destructive-foreground)',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--destructive)')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                              title="Delete Customer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '500px',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>New Customer</h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setDuplicateWarning(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Duplicate Customer Blocked Alert */}
            {duplicateWarning && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--destructive)', fontWeight: 600, fontSize: '0.875rem' }}>
                  <AlertTriangle size={16} />
                  <span>Existing Customer Found — Creation Blocked</span>
                </div>
                <p style={{ color: 'var(--foreground)', fontSize: '0.8125rem', marginTop: '0.375rem', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                  {duplicateWarning.message}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {duplicateWarning.duplicates.map((dup) => (
                    <div
                      key={dup.id}
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--foreground)',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <strong>{dup.full_name}</strong> {dup.phone ? `• ${dup.phone}` : ''} {dup.email ? `• ${dup.email}` : ''}
                      </div>
                      <Link
                        href={`/crm/customers/${dup.id}`}
                        target="_blank"
                        style={{
                          color: 'var(--primary)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textDecoration: 'underline',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View Profile →
                      </Link>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreate}>
              <input type="hidden" name="source" value="manual" />
              <input type="hidden" name="lead_id" value={selectedLeadId || ''} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* 1. Searchable Lead Selection */}
                <div>
                  <SearchableSelect
                    label="Select Lead"
                    required
                    placeholder="Search by name, phone, or Lead ID..."
                    options={leadOptions}
                    value={selectedLeadId}
                    onChange={handleLeadSelect}
                    helperText={
                      selectedLeadId
                        ? '✓ Customer details auto-populated from this Sales Lead.'
                        : 'Select the existing Lead that this Customer belongs to.'
                    }
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Full Name *
                  </label>
                  <input
                    name="full_name"
                    required
                    value={createFormData.full_name}
                    onChange={(e) => setCreateFormData({ ...createFormData, full_name: e.target.value })}
                    placeholder="e.g. Ahmed Mahmoud"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Phone *
                  </label>
                  <input
                    name="phone"
                    required
                    value={createFormData.phone}
                    onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                    placeholder="+20 100 123 4567"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Email (Optional)
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={createFormData.email}
                    onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                    placeholder="ahmed@example.com"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                {/* Real-time inline duplicate notification */}
                {duplicateMatch && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: 'var(--destructive)',
                      fontSize: '0.8125rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.375rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                      <AlertTriangle size={16} />
                      <span>
                        Customer Already Exists with this {duplicateMatch.phone === createFormData.phone.trim() ? 'Phone Number' : 'Email'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--foreground)' }}>
                      Existing Profile: <strong>{duplicateMatch.full_name}</strong> ({duplicateMatch.phone || 'No phone'} • {duplicateMatch.email || 'No email'})
                    </div>
                    <div>
                      <Link
                        href={`/crm/customers/${duplicateMatch.id}`}
                        target="_blank"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--primary)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textDecoration: 'underline',
                        }}
                      >
                        Open existing customer profile →
                      </Link>
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Notes (Optional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    value={createFormData.notes}
                    onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                    placeholder="Preferences, requirements, or reference notes"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                      outline: 'none',
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
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setDuplicateWarning(null);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || Boolean(duplicateMatch)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: duplicateMatch ? 'var(--muted)' : 'var(--primary)',
                    border: duplicateMatch ? '1px solid var(--border)' : '1px solid rgba(174, 172, 120, 0.4)',
                    color: duplicateMatch ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: isPending || Boolean(duplicateMatch) ? 'not-allowed' : 'pointer',
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  {duplicateMatch ? 'Customer Already Exists' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '500px',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>Edit Customer</h2>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <input type="hidden" name="id" value={editingCustomer.id} />
              <input type="hidden" name="source" value={editingCustomer.source} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Full Name *
                  </label>
                  <input
                    name="full_name"
                    required
                    defaultValue={editingCustomer.full_name}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Phone *
                  </label>
                  <input
                    name="phone"
                    required
                    defaultValue={editingCustomer.phone || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Email (Optional)
                  </label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingCustomer.email || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Notes (Optional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={editingCustomer.notes || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                      outline: 'none',
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
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem',
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
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--destructive-border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '440px',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--destructive)',
                  color: 'var(--destructive-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={18} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>Delete Customer</h2>
            </div>

            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--foreground)' }}>{deletingCustomer.full_name}</strong>? This customer will be
              soft-deleted and removed from active customer lists.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                disabled={isPending}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--destructive)',
                  border: '1px solid var(--destructive-border)',
                  color: 'var(--destructive-foreground)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Customers Report"
        description="Upload an Excel file (.xlsx) to create or update authorized customer records."
        moduleType="customers"
        onValidate={validateCustomersImportExcel}
        onExecute={executeCustomersImportExcel}
        onDownloadTemplate={getCustomerExcelTemplate}
        onSuccess={() => {
          setShowImportModal(false);
          router.refresh();
        }}
      />
    </div>
  );
}
