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

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'hsla(217 91% 60% / 0.15)', text: 'hsl(217 91% 70%)' },
  follow_up: { label: 'Follow-up', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  won: { label: 'Won', bg: 'hsla(142 76% 36% / 0.15)', text: 'hsl(142 76% 65%)' },
  lost: { label: 'Lost', bg: 'hsla(0 84% 60% / 0.15)', text: 'hsl(0 84% 75%)' },
  // Backward-compatibility fallbacks
  contacted: { label: 'Follow-up', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  qualified: { label: 'Follow-up', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  proposal: { label: 'Follow-up', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  negotiation: { label: 'Follow-up', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
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
            <Handshake size={24} style={{ color: 'hsl(217 91% 60%)' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
              Deals
            </h1>
          </div>
          <p style={{ color: 'hsl(220 14% 65%)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track and manage customer deals, follow-ups, and payment settlements.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canWrite && (
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                borderRadius: '0.5rem',
                background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 12px hsla(217 91% 60% / 0.25)',
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
          <X size={16} />
          {error}
        </div>
      )}

      {/* Filters: Search & Status Filter ONLY */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'hsl(222 47% 14%)',
            border: '1px solid hsla(0 0% 100% / 0.08)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            maxWidth: '320px',
            flex: 1,
          }}
        >
          <Search size={16} style={{ color: 'hsl(220 14% 50%)' }} />
          <input
            type="text"
            placeholder="Search deals or customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
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
            background: 'hsl(222 47% 14%)',
            border: '1px solid hsla(0 0% 100% / 0.08)',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
          }}
        >
          <Filter size={16} style={{ color: 'hsl(220 14% 50%)' }} />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {DEAL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: 'hsl(222 47% 11%)' }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Deals Table */}
      <div
        style={{
          background: 'hsl(222 47% 12%)',
          border: '1px solid hsla(0 0% 100% / 0.06)',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          boxShadow: '0 4px 20px hsla(0 0% 0% / 0.2)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid hsla(0 0% 100% / 0.08)', background: 'hsl(222 47% 10%)' }}>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>
                Deal / Customer
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>
                Status
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>
                Total Amount
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>
                Paid / Balance
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase' }}>
                Assigned Rep
              </th>
              <th style={{ padding: '0.875rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'hsl(220 14% 50%)', textTransform: 'uppercase', textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'hsl(220 14% 50%)' }}>
                  No deals found.
                </td>
              </tr>
            ) : (
              filteredDeals.map((deal) => {
                const colors = STAGE_CONFIG[deal.stage] || { label: deal.stage, bg: 'hsla(0 0% 100% / 0.1)', text: 'white' };
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
                      borderBottom: '1px solid hsla(0 0% 100% / 0.04)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'hsla(0 0% 100% / 0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Link
                        href={`/crm/deals/${deal.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'white',
                          textDecoration: 'none',
                          display: 'block',
                        }}
                      >
                        {deal.title}
                      </Link>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(220 14% 60%)' }}>
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
                        }}
                      >
                        {colors.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'white', fontWeight: 600, fontSize: '0.875rem' }}>
                      {formatCurrency(dealTotal)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem' }}>
                      {deal.stage === 'won' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                          <span style={{ color: 'hsl(142 76% 65%)', fontWeight: 600 }}>
                            Paid: {formatCurrency(dealPaid)}
                          </span>
                          {dealRemaining > 0 ? (
                            <span style={{ color: 'hsl(38 92% 65%)', fontSize: '0.75rem' }}>
                              Rem: {formatCurrency(dealRemaining)}
                            </span>
                          ) : (
                            <span style={{ color: 'hsl(220 14% 65%)', fontSize: '0.75rem' }}>
                              Fully Settled
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'hsl(220 14% 45%)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: 'hsl(220 14% 70%)' }}>
                      {deal.assigned_to_employee?.full_name || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                        <Link
                          href={`/crm/deals/${deal.id}`}
                          style={{
                            padding: '0.375rem',
                            borderRadius: '0.375rem',
                            border: '1px solid hsla(0 0% 100% / 0.1)',
                            background: 'transparent',
                            color: 'hsl(220 14% 75%)',
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
                                border: '1px solid hsla(0 0% 100% / 0.1)',
                                background: 'transparent',
                                color: 'hsl(217 91% 70%)',
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
                                  border: '1px solid hsla(142 76% 36% / 0.3)',
                                  background: 'hsla(142 76% 36% / 0.15)',
                                  color: 'hsl(142 76% 65%)',
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
                                border: '1px solid hsla(0 0% 100% / 0.1)',
                                background: 'transparent',
                                color: 'hsl(220 14% 75%)',
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
                              border: '1px solid hsla(0 0% 100% / 0.1)',
                              background: 'transparent',
                              color: 'hsl(262 83% 70%)',
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
              maxWidth: '540px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Create New Deal</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDeal}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Deal Title *
                  </label>
                  <input
                    name="title"
                    required
                    placeholder="e.g. Sharm El Sheikh Family Tour"
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                      Customer *
                    </label>
                    <select
                      name="customer_id"
                      required
                      defaultValue={initialCustomerId || ''}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
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
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                      Assigned Sales Rep *
                    </label>
                    <select
                      name="assigned_to"
                      defaultValue={user.employee.id}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
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
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                      Initial Status
                    </label>
                    <select
                      name="stage"
                      defaultValue="new"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="new">New</option>
                      <option value="follow_up">Follow-up</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
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
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                      Expected Close Date
                    </label>
                    <input
                      name="expected_close_date"
                      type="date"
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
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Customer requests, travel dates, passenger counts, or notes..."
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
                  onClick={() => setShowCreateModal(false)}
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
              maxWidth: '520px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Edit Deal</h2>
              <button
                onClick={() => setEditingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateDeal}>
              <input type="hidden" name="id" value={editingDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Deal Title *
                  </label>
                  <input
                    name="title"
                    required
                    defaultValue={editingDeal.title}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                      Customer *
                    </label>
                    <select
                      name="customer_id"
                      required
                      defaultValue={editingDeal.customer_id}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
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
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
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
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.12)',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Expected Close Date
                  </label>
                  <input
                    name="expected_close_date"
                    type="date"
                    defaultValue={editingDeal.expected_close_date || ''}
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
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    defaultValue={editingDeal.notes || ''}
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
                  onClick={() => setEditingDeal(null)}
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

      {/* Change Stage Modal */}
      {stageChangingDeal && (
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
              maxWidth: '480px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Change Deal Status</h2>
              <button
                onClick={() => setStageChangingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangeStage}>
              <input type="hidden" name="deal_id" value={stageChangingDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'hsl(220 14% 60%)', marginBottom: '0.5rem' }}>
                    Current deal: <strong style={{ color: 'white' }}>{stageChangingDeal.title}</strong>
                  </div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Select New Status *
                  </label>
                  <select
                    name="stage"
                    value={selectedNewStage}
                    onChange={(e) => setSelectedNewStage(e.target.value as DealStage)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
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
                      background: 'hsla(142 76% 36% / 0.1)',
                      border: '1px solid hsla(142 76% 36% / 0.25)',
                      borderRadius: '0.5rem',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(142 76% 65%)', fontWeight: 600, fontSize: '0.875rem' }}>
                      <Banknote size={16} />
                      Deal Settlement & Payment (EGP)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'hsl(220 14% 75%)', marginBottom: '0.25rem' }}>
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
                            borderRadius: '0.375rem',
                            background: 'hsl(222 47% 9%)',
                            border: '1px solid hsla(0 0% 100% / 0.15)',
                            color: 'white',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'hsl(220 14% 75%)', marginBottom: '0.25rem' }}>
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
                            borderRadius: '0.375rem',
                            background: 'hsl(222 47% 9%)',
                            border: `1px solid ${isWonOverpaid ? 'hsl(0 84% 60%)' : 'hsla(0 0% 100% / 0.15)'}`,
                            color: 'white',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'hsl(220 14% 75%)', marginBottom: '0.25rem' }}>
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
                          borderRadius: '0.375rem',
                          background: 'hsl(222 47% 7%)',
                          border: '1px solid hsla(0 0% 100% / 0.08)',
                          color: wonRemainingAmount > 0 ? 'hsl(38 92% 65%)' : 'hsl(142 76% 65%)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: 'not-allowed',
                        }}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'hsl(220 14% 50%)', marginTop: '0.25rem', display: 'block' }}>
                        Calculated automatically by system: Total Amount − Paid Amount
                      </span>
                    </div>

                    {isWonOverpaid && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'hsl(0 84% 70%)', fontSize: '0.75rem' }}>
                        <AlertTriangle size={14} />
                        Paid amount cannot exceed total amount.
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'hsl(220 14% 75%)', marginBottom: '0.25rem' }}>
                        Payment Method *
                      </label>
                      <select
                        value={wonPaymentMethod}
                        onChange={(e) => setWonPaymentMethod(e.target.value as PaymentMethod)}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '0.375rem',
                          background: 'hsl(222 47% 9%)',
                          border: '1px solid hsla(0 0% 100% / 0.15)',
                          color: 'white',
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
                      background: 'hsla(0 84% 60% / 0.1)',
                      border: '1px solid hsla(0 84% 60% / 0.25)',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(0 84% 75%)', marginBottom: '0.375rem' }}>
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
                        borderRadius: '0.375rem',
                        background: 'hsl(222 47% 9%)',
                        border: '1px solid hsla(0 0% 100% / 0.15)',
                        color: 'white',
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
                  disabled={isPending || (selectedNewStage === 'won' && isWonOverpaid)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    background: selectedNewStage === 'won' ? 'hsl(142 76% 36%)' : 'hsl(217 91% 50%)',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: (selectedNewStage === 'won' && isWonOverpaid) ? 'not-allowed' : 'pointer',
                    opacity: (selectedNewStage === 'won' && isWonOverpaid) ? 0.6 : 1,
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
              maxWidth: '460px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Banknote size={18} style={{ color: 'hsl(142 76% 65%)' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Update Payment</h2>
              </div>
              <button
                onClick={() => setPaymentUpdatingDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaymentUpdateSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'hsl(220 14% 65%)' }}>
                  Deal: <strong style={{ color: 'white' }}>{paymentUpdatingDeal.title}</strong>
                </div>

                <div
                  style={{
                    background: 'hsl(222 47% 9%)',
                    border: '1px solid hsla(0 0% 100% / 0.08)',
                    borderRadius: '0.5rem',
                    padding: '0.875rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'hsl(220 14% 65%)' }}>Total Deal Amount:</span>
                    <strong style={{ color: 'white' }}>
                      {formatCurrency(paymentUpdatingDeal.total_amount ?? paymentUpdatingDeal.value ?? 0)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'hsl(220 14% 65%)' }}>Previously Paid:</span>
                    <span style={{ color: 'hsl(142 76% 65%)', fontWeight: 600 }}>
                      {formatCurrency(paymentUpdatingDeal.paid_amount ?? 0)}
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
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
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 7%)',
                      border: '1px solid hsla(0 0% 100% / 0.08)',
                      color: 'hsl(38 92% 65%)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    Payment Method *
                  </label>
                  <select
                    value={updatePaymentMethod}
                    onChange={(e) => setUpdatePaymentMethod(e.target.value as PaymentMethod)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
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
                    background: 'hsl(142 76% 36%)',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
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
              maxWidth: '460px',
              padding: '1.5rem',
              boxShadow: '0 8px 32px hsla(0 0% 0% / 0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Reassign Deal</h2>
              <button
                onClick={() => setReassigningDeal(null)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(220 14% 60%)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassign}>
              <input type="hidden" name="deal_id" value={reassigningDeal.id} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'hsl(220 14% 65%)' }}>
                  Reassigning <strong style={{ color: 'white' }}>{reassigningDeal.title}</strong>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 14% 70%)', marginBottom: '0.375rem' }}>
                    New Assignee *
                  </label>
                  <select
                    name="assigned_to"
                    required
                    defaultValue={reassigningDeal.assigned_to}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      background: 'hsl(222 47% 9%)',
                      border: '1px solid hsla(0 0% 100% / 0.12)',
                      color: 'white',
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
                    background: 'hsl(262 83% 58%)',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
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
