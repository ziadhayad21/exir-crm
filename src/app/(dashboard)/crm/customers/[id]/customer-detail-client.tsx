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

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: 'hsla(217 91% 60% / 0.15)', text: 'hsl(217 91% 70%)' },
  follow_up: { bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  contacted: { bg: 'hsla(199 89% 48% / 0.15)', text: 'hsl(199 89% 65%)' },
  qualified: { bg: 'hsla(262 83% 58% / 0.15)', text: 'hsl(262 83% 70%)' },
  proposal: { bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  negotiation: { bg: 'hsla(25 95% 53% / 0.15)', text: 'hsl(25 95% 65%)' },
  won: { bg: 'hsla(142 76% 36% / 0.15)', text: 'hsl(142 76% 65%)' },
  lost: { bg: 'hsla(0 84% 60% / 0.15)', text: 'hsl(0 84% 75%)' },
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
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Back button */}
      <Link
        href="/crm/customers"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          color: 'hsl(220 14% 65%)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          marginBottom: '1rem',
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
            borderRadius: '0.5rem',
            background: 'hsla(142 76% 36% / 0.15)',
            border: '1px solid hsl(142 76% 36% / 0.3)',
            color: 'hsl(142 76% 65%)',
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
            borderRadius: '0.5rem',
            background: 'hsla(0 84% 60% / 0.15)',
            border: '1px solid hsl(0 84% 60% / 0.3)',
            color: 'hsl(0 84% 75%)',
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
          background: 'hsl(222 47% 12%)',
          border: '1px solid hsla(0 0% 100% / 0.08)',
          borderRadius: '0.75rem',
          padding: '1.75rem',
          marginBottom: '1.5rem',
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
                  background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                }}
              >
                {customer.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
                  {customer.full_name}
                </h1>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                  <span
                    style={{
                      color: 'hsl(220 14% 60%)',
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
                    borderRadius: '0.5rem',
                    background: 'hsl(222 47% 16%)',
                    border: '1px solid hsla(0 0% 100% / 0.1)',
                    color: 'hsl(220 14% 85%)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
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
                    borderRadius: '0.5rem',
                    background: 'hsla(0 84% 60% / 0.12)',
                    border: '1px solid hsla(0 84% 60% / 0.25)',
                    color: 'hsl(0 84% 75%)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
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
                borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
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
            borderTop: '1px solid hsla(0 0% 100% / 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Phone size={18} style={{ color: 'hsl(142 76% 65%)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>Phone</div>
              <div style={{ fontSize: '0.875rem', color: 'white', fontWeight: 500 }}>{customer.phone || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Mail size={18} style={{ color: 'hsl(217 91% 65%)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>Email</div>
              <div style={{ fontSize: '0.875rem', color: 'white' }}>{customer.email || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Briefcase size={18} style={{ color: 'hsl(262 83% 65%)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>Deals</div>
              <div style={{ fontSize: '0.875rem', color: 'white' }}>{customer.deals?.length || 0} associated</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {customer.notes && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid hsla(0 0% 100% / 0.06)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                color: 'hsl(220 14% 50%)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                marginBottom: '0.375rem',
              }}
            >
              <FileText size={14} />
              Notes
            </div>
            <p style={{ color: 'hsl(220 14% 80%)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
              {customer.notes}
            </p>
          </div>
        )}
      </div>

      {/* Customer Deals Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>
            Deals ({customer.deals?.length || 0})
          </h2>
        </div>

        {!customer.deals || customer.deals.length === 0 ? (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              background: 'hsl(222 47% 12%)',
              border: '1px solid hsla(0 0% 100% / 0.06)',
              borderRadius: '0.75rem',
              color: 'hsl(220 14% 50%)',
            }}
          >
            No deals found for this customer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {customer.deals.map((deal) => {
              const colors = STAGE_COLORS[deal.stage] || { bg: 'hsla(0 0% 100% / 0.1)', text: 'white' };

              return (
                <Link
                  key={deal.id}
                  href={`/crm/deals/${deal.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.25rem',
                    background: 'hsl(222 47% 12%)',
                    border: '1px solid hsla(0 0% 100% / 0.06)',
                    borderRadius: '0.5rem',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                        textTransform: 'capitalize',
                      }}
                    >
                      {deal.stage.replace('_', ' ')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'white', fontSize: '0.9375rem' }}>{deal.title}</div>
                      <div style={{ color: 'hsl(220 14% 60%)', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Created {formatDate(deal.created_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9375rem' }}>
                        {formatCurrency(deal.total_amount ?? deal.value ?? 0)}
                      </div>
                      {deal.stage === 'won' && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color:
                              (deal.remaining_amount ?? 0) > 0 ? 'hsl(38 92% 65%)' : 'hsl(142 76% 65%)',
                          }}
                        >
                          {(deal.remaining_amount ?? 0) > 0
                            ? `Rem: ${formatCurrency(deal.remaining_amount!)}`
                            : 'Settled'}
                        </div>
                      )}
                    </div>
                    <ArrowRight size={16} style={{ color: 'hsl(220 14% 45%)' }} />
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
            background: 'hsla(0 0% 0% / 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'hsl(222 47% 13%)',
              border: '1px solid hsla(0 0% 100% / 0.1)',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '500px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
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
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Edit Customer</h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
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
                      color: 'hsl(220 14% 70%)',
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'hsl(220 14% 70%)',
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'hsl(220 14% 70%)',
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: 'hsl(220 14% 70%)',
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
                      fontSize: '0.875rem',
                      resize: 'vertical',
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
                    borderRadius: '0.375rem',
                    background: 'transparent',
                    border: '1px solid hsla(0 0% 100% / 0.1)',
                    color: 'hsl(220 14% 70%)',
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
                    borderRadius: '0.375rem',
                    background: 'hsl(217 91% 50%)',
                    border: 'none',
                    color: 'white',
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
            background: 'hsla(0 0% 0% / 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'hsl(222 47% 13%)',
              border: '1px solid hsla(0 84% 60% / 0.3)',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '440px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'hsla(0 84% 60% / 0.15)',
                  color: 'hsl(0 84% 70%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={18} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Delete Customer</h2>
            </div>

            <p style={{ color: 'hsl(220 14% 75%)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              Are you sure you want to delete <strong>{customer.full_name}</strong>? This customer will be soft-deleted
              and removed from active lists.
            </p>

            {customer.deals && customer.deals.length > 0 && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  background: 'hsla(0 84% 60% / 0.1)',
                  border: '1px solid hsla(0 84% 60% / 0.25)',
                  color: 'hsl(0 84% 80%)',
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
                  borderRadius: '0.375rem',
                  background: 'transparent',
                  border: '1px solid hsla(0 0% 100% / 0.1)',
                  color: 'hsl(220 14% 70%)',
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
                  borderRadius: '0.375rem',
                  background: customer.deals && customer.deals.length > 0 ? 'hsl(222 47% 20%)' : 'hsl(0 84% 60%)',
                  border: 'none',
                  color: 'white',
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
