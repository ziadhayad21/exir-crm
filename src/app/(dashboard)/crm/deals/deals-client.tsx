// src/app/(dashboard)/crm/deals/deals-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createDeal, updateDeal, changeDealStage, reassignDeal, updateDealPayment } from '../actions';
import { formatCurrency } from '@/lib/utils';
import type { DealWithRelations, Customer, Employee, CurrentUser, DealStage, PaymentMethod } from '@/types';
import { hasPermission } from '@/lib/auth/client-helpers';
import {
  Plus,
  Handshake,
  Search,
  Filter,
  Eye,
  Edit2,
  X,
  Loader2,
  Check,
  UserCheck,
  ArrowRightCircle,
  Banknote,
  AlertTriangle,
} from 'lucide-react';

interface DealsClientProps {
  deals: DealWithRelations[];
  customers: Customer[];
  assignees: Employee[];
  user: CurrentUser;
  initialOpenCreate?: boolean;
  initialCustomerId?: string;
}

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  new: { label: 'New', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  follow_up: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  won: { label: 'Won', bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lost: { label: 'Lost', bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
  // Backward-compatibility fallbacks
  contacted: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  qualified: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  proposal: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  negotiation: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
};

const DEAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const ACTIVE_STATUSES: { value: DealStage; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash (نقداً)' },
  { value: 'bank_transfer', label: 'Bank Transfer (تحويل بنكي)' },
  { value: 'credit_card', label: 'Credit Card (بطاقة ائتمان)' },
  { value: 'vodafone_cash', label: 'Vodafone Cash (فودافون كاش)' },
  { value: 'instapay', label: 'InstaPay (إنستاباي)' },
  { value: 'other', label: 'Other (أخرى)' },
];

export function DealsClient({
  deals,
  customers,
  assignees,
  user,
  initialOpenCreate = false,
  initialCustomerId,
}: DealsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  const [showCreateModal, setShowCreateModal] = useState(initialOpenCreate);
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null);
  const [stageChangingDeal, setStageChangingDeal] = useState<DealWithRelations | null>(null);
  const [reassigningDeal, setReassigningDeal] = useState<DealWithRelations | null>(null);
  const [paymentUpdatingDeal, setPaymentUpdatingDeal] = useState<DealWithRelations | null>(null);

  const [selectedNewStage, setSelectedNewStage] = useState<DealStage>('new');
  const [wonTotalAmount, setWonTotalAmount] = useState<string>('');
  const [wonPaidAmount, setWonPaidAmount] = useState<string>('0');
  const [wonPaymentMethod, setWonPaymentMethod] = useState<PaymentMethod>('cash');

  const [updatePaidAmount, setUpdatePaidAmount] = useState<string>('');
  const [updatePaymentMethod, setUpdatePaymentMethod] = useState<PaymentMethod>('cash');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canWrite = hasPermission(user, 'crm.deals.write');
  const canReassign = hasPermission(user, 'crm.deals.reassign');

  const filteredDeals = deals.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.customer?.full_name.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesStage = true;
    if (stageFilter !== 'all') {
      if (stageFilter === 'follow_up') {
        matchesStage = ['follow_up', 'contacted', 'qualified', 'proposal', 'negotiation'].includes(d.stage);
      } else {
        matchesStage = d.stage === stageFilter;
      }
    }

    return matchesSearch && matchesStage;
  });

  // Calculate live won remaining amount
  const parsedWonTotal = parseFloat(wonTotalAmount) || 0;
  const parsedWonPaid = parseFloat(wonPaidAmount) || 0;
  const wonRemainingAmount = Math.max(0, parsedWonTotal - parsedWonPaid);
  const isWonOverpaid = parsedWonPaid > parsedWonTotal;

  function openStageChangeModal(deal: DealWithRelations) {
    setStageChangingDeal(deal);
    const normalizedStage = ['contacted', 'qualified', 'proposal', 'negotiation'].includes(deal.stage)
      ? 'follow_up'
      : deal.stage;
    setSelectedNewStage(normalizedStage as DealStage);
    const existingTotal = deal.total_amount ?? deal.value ?? '';
    setWonTotalAmount(existingTotal !== null && existingTotal !== undefined ? String(existingTotal) : '');
    setWonPaidAmount(deal.paid_amount !== null && deal.paid_amount !== undefined ? String(deal.paid_amount) : '0');
    setWonPaymentMethod(deal.payment_method ?? 'cash');
  }

  function openPaymentUpdateModal(deal: DealWithRelations) {
    setPaymentUpdatingDeal(deal);
    setUpdatePaidAmount(deal.paid_amount !== null && deal.paid_amount !== undefined ? String(deal.paid_amount) : '');
    setUpdatePaymentMethod(deal.payment_method ?? 'cash');
  }

  function handleCreateDeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createDeal(formData);
      if (result.success) {
        setShowCreateModal(false);
        setSuccess('Deal created successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to create deal');
      }
    });
  }

  function handleUpdateDeal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateDeal(formData);
      if (result.success) {
        setEditingDeal(null);
        setSuccess('Deal updated successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update deal');
      }
    });
  }

  function handleChangeStage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    if (selectedNewStage === 'won') {
      if (isWonOverpaid) {
        setError('Paid amount cannot exceed total amount.');
        return;
      }
      formData.set('total_amount', wonTotalAmount);
      formData.set('paid_amount', wonPaidAmount);
      formData.set('payment_method', wonPaymentMethod);
    }

    startTransition(async () => {
      const result = await changeDealStage(formData);
      if (result.success) {
        setStageChangingDeal(null);
        setSuccess('Deal stage changed successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update stage');
      }
    });
  }

  function handlePaymentUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!paymentUpdatingDeal) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('deal_id', paymentUpdatingDeal.id);
    formData.set('paid_amount', updatePaidAmount);
    formData.set('payment_method', updatePaymentMethod);

    const dealTotal = paymentUpdatingDeal.total_amount ?? paymentUpdatingDeal.value ?? 0;
    if (parseFloat(updatePaidAmount) > dealTotal) {
      setError(`Paid amount cannot exceed total amount (${formatCurrency(dealTotal)}).`);
      return;
    }

    startTransition(async () => {
      const result = await updateDealPayment(formData);
      if (result.success) {
        setPaymentUpdatingDeal(null);
        setSuccess('Payment information updated successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update payment');
      }
    });
  }

  function handleReassign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await reassignDeal(formData);
      if (result.success) {
        setReassigningDeal(null);
        setSuccess('Deal reassigned successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to reassign deal');
      }
    });
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', color: 'var(--foreground)' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(174, 172, 120, 0.4)',
              boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
            }}
          >
            <Handshake size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.02em' }}>
              Deals
            </h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', margin: 0 }}>
              Track and manage customer deals, follow-ups, and payment settlements.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canWrite && (
            <button
              onClick={() => setShowCreateModal(true)}
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
                boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
              }}
            >
              <Plus size={16} />
              New Deal
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
            background: 'var(--success)',
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
            background: 'var(--destructive)',
            border: '1px solid var(--destructive-border)',
            color: 'var(--destructive-foreground)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <X size={16} />
          {error}
        </div>
      )}

      {/* Filters: Search & Status Filter */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '0.5rem 0.75rem',
            maxWidth: '320px',
            flex: 1,
            boxShadow: '0 1px 2px rgba(76, 69, 65, 0.03)',
          }}
        >
          <Search size={16} style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search deals or customers..."
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
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '0.5rem 0.75rem',
            boxShadow: '0 1px 2px rgba(76, 69, 65, 0.03)',
          }}
        >
          <Filter size={16} style={{ color: 'var(--muted-foreground)' }} />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {DEAL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: 'var(--card)', color: 'var(--foreground)' }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Deals Table */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Deal / Customer
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Status
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Total Amount
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Paid / Balance
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                Assigned Rep
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                  No deals found.
                </td>
              </tr>
            ) : (
              filteredDeals.map((deal) => {
                const colors = STAGE_CONFIG[deal.stage] || { label: deal.stage, bg: 'var(--surface-muted)', text: 'var(--foreground)', border: 'var(--border)' };
                const isOwner = deal.assigned_to === user.employee.id || deal.created_by === user.employee.id;
                const canModify = canWrite && (isOwner || hasPermission(user, 'crm.deals.read_all'));
                const canReassignThis = canReassign && (isOwner || hasPermission(user, 'crm.deals.read_all'));
                const dealTotal = deal.total_amount ?? deal.value ?? 0;
                const dealPaid = deal.paid_amount ?? 0;
                const dealRemaining = deal.remaining_amount ?? Math.max(0, dealTotal - dealPaid);

                return (
                  <tr
                    key={deal.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Link
                        href={`/crm/deals/${deal.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'var(--foreground)',
                          textDecoration: 'none',
                          display: 'block',
                        }}
                      >
                        {deal.title}
                      </Link>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        {deal.customer?.full_name || 'Unknown Customer'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.25rem 0.625rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border || 'transparent'}`,
                        }}
                      >
                        {colors.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--foreground)', fontWeight: 600, fontSize: '0.875rem' }}>
                      {formatCurrency(dealTotal)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem' }}>
                      {deal.stage === 'won' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                          <span style={{ color: 'var(--success-foreground)', fontWeight: 600 }}>
                            Paid: {formatCurrency(dealPaid)}
                          </span>
                          {dealRemaining > 0 ? (
                            <span style={{ color: 'var(--warning-foreground)', fontSize: '0.75rem' }}>
                              Rem: {formatCurrency(dealRemaining)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                              Fully Settled
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                      {deal.assigned_to_employee?.full_name || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                        <Link
                          href={`/crm/deals/${deal.id}`}
                          style={{
                            padding: '0.375rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--muted-foreground)',
                            display: 'inline-flex',
                          }}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </Link>
                        {canModify && (
                          <>
                            <button
                              onClick={() => openStageChangeModal(deal)}
                              style={{
                                padding: '0.375rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--info-border)',
                                background: 'var(--info)',
                                color: 'var(--info-foreground)',
                                cursor: 'pointer',
                              }}
                              title="Change Status"
                            >
                              <ArrowRightCircle size={14} />
                            </button>
                            {deal.stage === 'won' && (
                              <button
                                onClick={() => openPaymentUpdateModal(deal)}
                                style={{
                                  padding: '0.375rem',
                                  borderRadius: '0.375rem',
                                  border: '1px solid var(--success-border)',
                                  background: 'var(--success)',
                                  color: 'var(--success-foreground)',
                                  cursor: 'pointer',
                                }}
                                title="Update Payment"
                              >
                                <Banknote size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingDeal(deal)}
                              style={{
                                padding: '0.375rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                              }}
                              title="Edit Deal"
                            >
                              <Edit2 size={14} />
                            </button>
                          </>
                        )}
                        {canReassignThis && (
                          <button
                            onClick={() => setReassigningDeal(deal)}
                            style={{
                              padding: '0.375rem',
                              borderRadius: '0.375rem',
                              border: '1px solid rgba(174, 172, 120, 0.4)',
                              background: 'var(--accent)',
                              color: 'var(--foreground)',
                              cursor: 'pointer',
                            }}
                            title="Reassign Deal"
                          >
                            <UserCheck size={14} />
                          </button>
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
            background: 'rgba(76, 69, 65, 0.45)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '540px',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-card)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Create New Deal</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDeal}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Deal Title *
                  </label>
                  <input
                    name="title"
                    required
                    placeholder="e.g. Sharm El Sheikh Family Tour"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Customer *
                    </label>
                    <select
                      name="customer_id"
                      required
                      defaultValue={initialCustomerId || ''}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="" disabled>Select customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Assigned Sales Rep *
                    </label>
                    <select
                      name="assigned_to"
                      defaultValue={user.employee.id}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name} {a.id === user.employee.id ? '(You)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Initial Status
                    </label>
                    <select
                      name="stage"
                      defaultValue="new"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="new">New</option>
                      <option value="follow_up">Follow-up</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Total Amount (EGP)
                    </label>
                    <input
                      name="total_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 15000"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Expected Close Date
                    </label>
                    <input
                      name="expected_close_date"
                      type="date"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Customer requests, travel dates, passenger counts, or notes..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)',
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
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingDeal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.45)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '520px',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Edit Deal</h2>
              <button
                onClick={() => setEditingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateDeal}>
              <input type="hidden" name="id" value={editingDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Deal Title *
                  </label>
                  <input
                    name="title"
                    required
                    defaultValue={editingDeal.title}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Customer *
                    </label>
                    <select
                      name="customer_id"
                      required
                      defaultValue={editingDeal.customer_id}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Total Amount (EGP)
                    </label>
                    <input
                      name="total_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={
                        editingDeal.total_amount !== null && editingDeal.total_amount !== undefined
                          ? String(editingDeal.total_amount)
                          : editingDeal.value !== null && editingDeal.value !== undefined
                          ? String(editingDeal.value)
                          : ''
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Expected Close Date
                  </label>
                  <input
                    name="expected_close_date"
                    type="date"
                    defaultValue={editingDeal.expected_close_date || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={editingDeal.notes || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingDeal(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)',
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
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
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

      {/* Change Stage Modal */}
      {stageChangingDeal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.45)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '480px',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-card)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Change Deal Status</h2>
              <button
                onClick={() => setStageChangingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangeStage}>
              <input type="hidden" name="deal_id" value={stageChangingDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Current deal: <strong style={{ color: 'var(--foreground)' }}>{stageChangingDeal.title}</strong>
                  </div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Select New Status *
                  </label>
                  <select
                    name="stage"
                    value={selectedNewStage}
                    onChange={(e) => setSelectedNewStage(e.target.value as DealStage)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {ACTIVE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Won / Completed Financial Section */}
                {selectedNewStage === 'won' && (
                  <div
                    style={{
                      background: 'var(--success)',
                      border: '1px solid var(--success-border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-foreground)', fontWeight: 600, fontSize: '0.875rem' }}>
                      <Banknote size={16} />
                      Deal Settlement & Payment (EGP)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                          Total Amount (EGP) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={wonTotalAmount}
                          onChange={(e) => setWonTotalAmount(e.target.value)}
                          placeholder="e.g. 25000"
                          style={{
                            width: '100%',
                            padding: '0.45rem 0.65rem',
                            borderRadius: 'var(--radius)',
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                          Paid Amount (EGP) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={wonPaidAmount}
                          onChange={(e) => setWonPaidAmount(e.target.value)}
                          placeholder="e.g. 10000"
                          style={{
                            width: '100%',
                            padding: '0.45rem 0.65rem',
                            borderRadius: 'var(--radius)',
                            background: 'var(--card)',
                            border: `1px solid ${isWonOverpaid ? 'var(--destructive-border)' : 'var(--border)'}`,
                            color: 'var(--foreground)',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                        Remaining Amount (EGP)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formatCurrency(wonRemainingAmount)}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.65rem',
                          borderRadius: 'var(--radius)',
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border)',
                          color: wonRemainingAmount > 0 ? 'var(--warning-foreground)' : 'var(--success-foreground)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: 'not-allowed',
                        }}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.25rem', display: 'block' }}>
                        Calculated automatically by system: Total Amount − Paid Amount
                      </span>
                    </div>

                    {isWonOverpaid && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--destructive-foreground)', fontSize: '0.75rem' }}>
                        <AlertTriangle size={14} />
                        Paid amount cannot exceed total amount.
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                        Payment Method *
                      </label>
                      <select
                        value={wonPaymentMethod}
                        onChange={(e) => setWonPaymentMethod(e.target.value as PaymentMethod)}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.65rem',
                          borderRadius: 'var(--radius)',
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          color: 'var(--foreground)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {PAYMENT_METHODS.map((pm) => (
                          <option key={pm.value} value={pm.value}>
                            {pm.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Mandatory lost reason if selecting 'lost' */}
                {selectedNewStage === 'lost' && (
                  <div
                    style={{
                      background: 'var(--destructive)',
                      border: '1px solid var(--destructive-border)',
                      borderRadius: 'var(--radius)',
                      padding: '0.75rem',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--destructive-foreground)', marginBottom: '0.375rem' }}>
                      Lost Reason (Mandatory) *
                    </label>
                    <textarea
                      name="lost_reason"
                      required
                      rows={2}
                      placeholder="Specify why the deal was lost (e.g. Budget constraints, opted for competitor)..."
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setStageChangingDeal(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || (selectedNewStage === 'won' && isWonOverpaid)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: (selectedNewStage === 'won' && isWonOverpaid) ? 'not-allowed' : 'pointer',
                    opacity: (selectedNewStage === 'won' && isWonOverpaid) ? 0.6 : 1,
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirm Status Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Payment Modal (for Won deals) */}
      {paymentUpdatingDeal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.45)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '460px',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Banknote size={18} style={{ color: 'var(--success-foreground)' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Update Payment</h2>
              </div>
              <button
                onClick={() => setPaymentUpdatingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaymentUpdateSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  Deal: <strong style={{ color: 'var(--foreground)' }}>{paymentUpdatingDeal.title}</strong>
                </div>

                <div
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.875rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Total Deal Amount:</span>
                    <strong style={{ color: 'var(--foreground)' }}>
                      {formatCurrency(paymentUpdatingDeal.total_amount ?? paymentUpdatingDeal.value ?? 0)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Previously Paid:</span>
                    <span style={{ color: 'var(--success-foreground)', fontWeight: 600 }}>
                      {formatCurrency(paymentUpdatingDeal.paid_amount ?? 0)}
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    New Total Paid Amount (EGP) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={updatePaidAmount}
                    onChange={(e) => setUpdatePaidAmount(e.target.value)}
                    placeholder="Enter updated paid amount"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Remaining Balance (EGP)
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={formatCurrency(
                      Math.max(
                        0,
                        (paymentUpdatingDeal.total_amount ?? paymentUpdatingDeal.value ?? 0) -
                          (parseFloat(updatePaidAmount) || 0)
                      )
                    )}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--warning-foreground)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Payment Method *
                  </label>
                  <select
                    value={updatePaymentMethod}
                    onChange={(e) => setUpdatePaymentMethod(e.target.value as PaymentMethod)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm.value} value={pm.value}>
                        {pm.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPaymentUpdatingDeal(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)',
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
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {reassigningDeal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.45)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '460px',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Reassign Deal</h2>
              <button
                onClick={() => setReassigningDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassign}>
              <input type="hidden" name="deal_id" value={reassigningDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  Reassigning <strong style={{ color: 'var(--foreground)' }}>{reassigningDeal.title}</strong>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    New Assignee *
                  </label>
                  <select
                    name="assigned_to"
                    required
                    defaultValue={reassigningDeal.assigned_to}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setReassigningDeal(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted-foreground)',
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
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirm Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
