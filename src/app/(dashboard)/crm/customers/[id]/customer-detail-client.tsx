// src/app/(dashboard)/crm/customers/[id]/customer-detail-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCustomer, softDeleteCustomer } from '../../actions';
import { createLead } from '../../lead-actions';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { CustomerWithDeals, CurrentUser } from '@/types';
import { hasPermission, hasAnyPermission } from '@/lib/auth/client-helpers';
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
  Inbox,
  UserCheck,
  Clock,
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

const LEAD_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  in_progress: { label: 'In Progress', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  follow_up: { label: 'Follow Up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  won: { label: 'Won', bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lose: { label: 'Lose', bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  referral: 'Referral',
  walk_in: 'Walk-in',
  website: 'Website',
  social_media: 'Social Media',
  whatsapp: 'WhatsApp',
  phone_call: 'Phone Call',
  other: 'Other',
};

export function CustomerDetailClient({ customer, user }: CustomerDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false);
  const [leadSource, setLeadSource] = useState('manual');
  const [leadNotes, setLeadNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canWrite = hasPermission(user, 'crm.customers.write');
  const isOwner = customer.created_by === user.employee.id;
  const hasFullAccess = hasPermission(user, 'crm.customers.read_all');
  const canModify = canWrite && (isOwner || hasFullAccess);
  const canCreateLead = hasAnyPermission(user, ['crm.leads.write']);

  function handleCreateLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('full_name', customer.full_name);
    if (customer.phone) formData.set('phone', customer.phone);
    if (customer.email) formData.set('email', customer.email);
    formData.set('source', leadSource);
    formData.set('notes', leadNotes);
    formData.set('customer_id', customer.id);

    startTransition(async () => {
      const result = await createLead(formData);
      if (result.success) {
        setShowCreateLeadModal(false);
        setLeadSource('manual');
        setLeadNotes('');
        setSuccess('New sales lead created and linked to this customer!');
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(result.error || 'Failed to create lead');
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

            {canCreateLead && (
              <button
                type="button"
                onClick={() => setShowCreateLeadModal(true)}
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
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
              >
                <Plus size={16} />
                Create New Lead
              </button>
            )}

            <Link
              href="/crm/leads"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 2px 4px rgba(76, 69, 65, 0.04)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
            >
              <Briefcase size={16} />
              View Deals
            </Link>
          </div>
        </div>

        {/* Contact Info Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
            <Inbox size={18} style={{ color: 'var(--olive)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Leads</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--foreground)', fontWeight: 500 }}>{customer.leads?.length || 0} linked</div>
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

      {/* Customer Leads (Sales Opportunities) Section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
              Sales Leads & Interactions ({customer.leads?.length || 0})
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
              One Customer → Many Leads. Separate sales opportunities and interaction history.
            </p>
          </div>
          {canCreateLead && (
            <button
              type="button"
              onClick={() => setShowCreateLeadModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              Create New Lead
            </button>
          )}
        </div>

        {!customer.leads || customer.leads.length === 0 ? (
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
            <Inbox size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>No sales leads linked to this customer yet.</p>
            {canCreateLead && (
              <button
                type="button"
                onClick={() => setShowCreateLeadModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.4rem 0.875rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                Create First Lead
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {customer.leads.map((lead) => {
              const cfg = LEAD_STATUS_CONFIG[lead.status] || {
                label: lead.status,
                bg: 'var(--muted)',
                text: 'var(--foreground)',
                border: 'var(--border)',
              };

              return (
                <div
                  key={lead.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.25rem',
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: cfg.bg,
                        color: cfg.text,
                        border: `1px solid ${cfg.border}`,
                      }}
                    >
                      {cfg.label}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '0.9375rem' }}>
                          {lead.service_name || lead.service_type || `Lead #${lead.id.slice(0, 8)}`}
                        </span>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          {LEAD_SOURCE_LABELS[lead.source] || lead.source}
                        </span>
                      </div>
                      <div style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Calendar size={12} />
                          {formatDate(lead.created_at)}
                        </span>
                        {lead.status === 'follow_up' && lead.follow_up_at && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--warning-foreground)' }}>
                            <Clock size={12} />
                            Follow-up: {formatDate(lead.follow_up_at)}
                          </span>
                        )}
                        {lead.notes && (
                          <span style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Note: {lead.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    {lead.status === 'won' && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '0.9375rem' }}>
                          {Number(lead.total_amount ?? 0).toLocaleString()} EGP
                        </div>
                        <div style={{ fontSize: '0.75rem', color: (lead.remaining_amount ?? 0) > 0 ? 'var(--warning-foreground)' : 'var(--success-foreground)' }}>
                          {(lead.remaining_amount ?? 0) > 0 ? `Rem: ${Number(lead.remaining_amount).toLocaleString()} EGP` : 'Settled'}
                        </div>
                      </div>
                    )}

                    {lead.status === 'lose' && lead.lost_reason && (
                      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--destructive-foreground)', maxWidth: '180px' }}>
                        Lost: {lead.lost_reason}
                      </div>
                    )}

                    <Link
                      href="/crm/leads"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        fontSize: '0.8125rem',
                        color: 'var(--primary)',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      View in Leads
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
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
                  href="/crm/leads"
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

      {/* Create New Lead for Customer Modal */}
      {showCreateLeadModal && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateLeadModal(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '520px',
              padding: '1.75rem',
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
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                  Create New Lead
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                  Create a new sales opportunity for this customer (One Customer → Many Leads).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateLeadModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLead}>
              {/* Selected Customer Card (Locked) */}
              <div
                style={{
                  padding: '0.875rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'rgba(174, 172, 120, 0.15)',
                  border: '1px solid rgba(174, 172, 120, 0.35)',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  {customer.full_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--foreground)' }}>
                      {customer.full_name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(174, 172, 120, 0.3)',
                        color: 'var(--foreground)',
                      }}
                    >
                      Pre-selected Customer
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                    {customer.phone ? `Phone: ${customer.phone}` : 'No phone'}
                    {customer.email ? ` • ${customer.email}` : ''}
                  </div>
                </div>
                <UserCheck size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              </div>

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
                    Lead Source
                  </label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                    }}
                  >
                    <option value="manual">Manual</option>
                    <option value="referral">Referral</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="website">Website</option>
                    <option value="social_media">Social Media</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone_call">Phone Call</option>
                    <option value="other">Other</option>
                  </select>
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
                    Interaction Notes / Requested Service
                  </label>
                  <textarea
                    rows={3}
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    placeholder="Enter notes about this sales interaction or package requested..."
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  This new lead will be automatically assigned to an eligible Sales agent via round-robin distribution and linked directly to this customer.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateLeadModal(false)}
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
                      cursor: isPending ? 'not-allowed' : 'pointer',
                      opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                    {isPending ? 'Creating...' : 'Create Lead'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
