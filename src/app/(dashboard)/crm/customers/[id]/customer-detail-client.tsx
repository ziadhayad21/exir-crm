// src/app/(dashboard)/crm/customers/[id]/customer-detail-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCustomer, softDeleteCustomer } from '../../actions';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { CustomerWithDeals, CurrentUser } from '@/types';
import { hasPermission } from '@/lib/auth/client-helpers';
import {
  ChevronLeft,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  FileText,
  Plus,
  ArrowRight,
  Edit2,
  Trash2,
  X,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface CustomerDetailClientProps {
  customer: CustomerWithDeals;
  user: CurrentUser;
}

const STAGE_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  contacted: { bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  qualified: { bg: 'var(--accent)', text: 'var(--foreground)', border: 'var(--border)' },
  follow_up: { bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  proposal: { bg: 'var(--hover)', text: 'var(--foreground)', border: 'var(--border-strong)' },
  negotiation: { bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  won: { bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lost: { bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
};

export function CustomerDetailClient({ customer, user }: CustomerDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canWrite = hasPermission(user, 'crm.customers.write');
  const isOwner = customer.created_by === user.employee.id;
  const hasFullAccess = hasPermission(user, 'crm.customers.read_all');
  const canModify = canWrite && (isOwner || hasFullAccess);

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateCustomer(formData);
      if (result.success) {
        setShowEditModal(false);
        setSuccess('Customer updated successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update customer');
      }
    });
  }

  function handleDelete() {
    setError(null);
    const formData = new FormData();
    formData.set('id', customer.id);

    startTransition(async () => {
      const result = await softDeleteCustomer(formData);
      if (result.success) {
        setShowDeleteModal(false);
        router.push('/crm/customers');
      } else {
        setError(result.error ?? 'Failed to delete customer');
      }
    });
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem', color: 'var(--foreground)' }}>
      {/* Back button */}
      <Link
        href="/crm/customers"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          color: 'var(--muted-foreground)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          marginBottom: '1rem',
          transition: 'color 0.15s ease',
        }}
      >
        <ChevronLeft size={16} />
        Back to Customers
      </Link>

      {/* Success Notification */}
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

      {/* Error Notification */}
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

      {/* Main card */}
      <div
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1.75rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--foreground)',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                }}
              >
                {customer.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
                  {customer.full_name}
                </h1>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                  <span
                    style={{
                      color: 'var(--muted-foreground)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Calendar size={12} />
                    Added {formatDate(customer.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            {canModify && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.5rem 0.875rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                >
                  <Edit2 size={15} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.5rem 0.875rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--destructive-border)',
                    color: 'var(--destructive-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--destructive)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </>
            )}

            <Link
              href={`/crm/deals?new=true&customer_id=${customer.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--primary)',
                border: '1px solid rgba(174, 172, 120, 0.4)',
                color: 'var(--primary-foreground)',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
            >
              <Plus size={16} />
              Create Deal
            </Link>
          </div>
        </div>

        {/* Contact Info Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(174, 172, 120, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Phone size={18} style={{ color: 'var(--olive)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Phone</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--foreground)', fontWeight: 500 }}>{customer.phone || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Mail size={18} style={{ color: 'var(--olive)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Email</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>{customer.email || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Briefcase size={18} style={{ color: 'var(--olive)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Deals</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>{customer.deals?.length || 0} associated</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {customer.notes && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(174, 172, 120, 0.2)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                color: 'var(--muted-foreground)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                marginBottom: '0.375rem',
              }}
            >
              <FileText size={14} />
              Notes
            </div>
            <p style={{ color: 'var(--foreground)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
              {customer.notes}
            </p>
          </div>
        )}
      </div>

      {/* Customer Deals Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>
            Deals ({customer.deals?.length || 0})
          </h2>
        </div>

        {!customer.deals || customer.deals.length === 0 ? (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--muted-foreground)',
            }}
          >
            No deals found for this customer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {customer.deals.map((deal) => {
              const cfg = STAGE_CONFIG[deal.stage] || { bg: 'var(--muted)', text: 'var(--foreground)', border: 'var(--border)' };

              return (
                <Link
                  key={deal.id}
                  href={`/crm/deals/${deal.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.25rem',
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: cfg.bg,
                        color: cfg.text,
                        border: `1px solid ${cfg.border}`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {deal.stage.replace('_', ' ')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.9375rem' }}>{deal.title}</div>
                      <div style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Created {formatDate(deal.created_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '0.9375rem' }}>
                        {formatCurrency(deal.total_amount ?? deal.value ?? 0)}
                      </div>
                      {deal.stage === 'won' && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color:
                              (deal.remaining_amount ?? 0) > 0 ? 'var(--warning-foreground)' : 'var(--success-foreground)',
                          }}
                        >
                          {(deal.remaining_amount ?? 0) > 0
                            ? `Rem: ${formatCurrency(deal.remaining_amount!)}`
                            : 'Settled'}
                        </div>
                      )}
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)' }}>Edit Customer</h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <input type="hidden" name="id" value={customer.id} />
              <input type="hidden" name="source" value={customer.source} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    Full Name *
                  </label>
                  <input
                    name="full_name"
                    required
                    defaultValue={customer.full_name}
                    placeholder="Customer full name"
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Phone *
                  </label>
                  <input
                    name="phone"
                    required
                    defaultValue={customer.phone || ''}
                    placeholder="+20 1..."
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Email (Optional)
                  </label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={customer.email || ''}
                    placeholder="customer@example.com"
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Notes (Optional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={customer.notes || ''}
                    placeholder="Customer preferences, background, or special notes"
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
                  onClick={() => setShowEditModal(false)}
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
      {showDeleteModal && (
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

            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--foreground)' }}>{customer.full_name}</strong>? This customer will be soft-deleted
              and removed from active lists.
            </p>

            {customer.deals && customer.deals.length > 0 && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--warning)',
                  border: '1px solid var(--warning-border)',
                  color: 'var(--warning-foreground)',
                  fontSize: '0.8125rem',
                  marginBottom: '1.25rem',
                }}
              >
                <strong>Protected:</strong> This customer has {customer.deals.length} associated deal(s). Customers with
                associated deals cannot be deleted.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
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
                disabled={isPending || (customer.deals && customer.deals.length > 0)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: customer.deals && customer.deals.length > 0 ? 'var(--muted)' : 'var(--destructive)',
                  border: `1px solid ${customer.deals && customer.deals.length > 0 ? 'var(--border)' : 'var(--destructive-border)'}`,
                  color: customer.deals && customer.deals.length > 0 ? 'var(--muted-foreground)' : 'var(--destructive-foreground)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: customer.deals && customer.deals.length > 0 ? 'not-allowed' : 'pointer',
                  opacity: customer.deals && customer.deals.length > 0 ? 0.6 : 1,
                }}
              >
                {isPending && <Loader2 size={14} className="animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
