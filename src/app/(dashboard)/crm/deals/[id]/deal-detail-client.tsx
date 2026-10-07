// src/app/(dashboard)/crm/deals/[id]/deal-detail-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { changeDealStage, reassignDeal, addDealActivity, updateDealPayment } from '../../actions';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import type { DealWithRelations, Employee, CurrentUser, DealStage, PaymentMethod } from '@/types';
import { hasPermission } from '@/lib/auth/client-helpers';
import {
  ChevronLeft,
  UserCheck,
  Send,
  MessageSquare,
  PhoneCall,
  Mail,
  Users,
  Activity,
  ArrowRight,
  Check,
  X,
  Loader2,
  AlertCircle,
  Building,
  Banknote,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';

interface DealDetailClientProps {
  deal: DealWithRelations;
  assignees: Employee[];
  user: CurrentUser;
}

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  new: { label: 'New', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  follow_up: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  won: { label: 'Won', bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lost: { label: 'Lost', bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
  // Backward-compatibility
  contacted: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  qualified: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  proposal: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  negotiation: { label: 'Follow-up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
};

const STAGES: { value: DealStage; label: string }[] = [
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

export function DealDetailClient({ deal, assignees, user }: DealDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showLostModal, setShowLostModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Won stage transition state
  const existingTotal = deal.total_amount ?? deal.value ?? '';
  const [wonTotalAmount, setWonTotalAmount] = useState<string>(
    existingTotal !== null && existingTotal !== undefined ? String(existingTotal) : ''
  );
  const [wonPaidAmount, setWonPaidAmount] = useState<string>(
    deal.paid_amount !== null && deal.paid_amount !== undefined ? String(deal.paid_amount) : '0'
  );
  const [wonPaymentMethod, setWonPaymentMethod] = useState<PaymentMethod>(deal.payment_method ?? 'cash');

  // Payment update state (for already-won deal)
  const [updatePaidAmount, setUpdatePaidAmount] = useState<string>(
    deal.paid_amount !== null && deal.paid_amount !== undefined ? String(deal.paid_amount) : ''
  );
  const [updatePaymentMethod, setUpdatePaymentMethod] = useState<PaymentMethod>(deal.payment_method ?? 'cash');

  const [activityContent, setActivityContent] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting'>('note');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOwner = deal.assigned_to === user.employee.id || deal.created_by === user.employee.id;
  const canWrite = hasPermission(user, 'crm.deals.write') && (isOwner || hasPermission(user, 'crm.deals.read_all'));
  const canReassign = hasPermission(user, 'crm.deals.reassign') && (isOwner || hasPermission(user, 'crm.deals.read_all'));

  const parsedWonTotal = parseFloat(wonTotalAmount) || 0;
  const parsedWonPaid = parseFloat(wonPaidAmount) || 0;
  const wonRemainingAmount = Math.max(0, parsedWonTotal - parsedWonPaid);
  const isWonOverpaid = parsedWonPaid > parsedWonTotal;

  const dealTotal = deal.total_amount ?? deal.value ?? 0;
  const dealPaid = deal.paid_amount ?? 0;
  const dealRemaining = deal.remaining_amount ?? Math.max(0, dealTotal - dealPaid);

  function handleStageClick(targetStage: DealStage) {
    if (targetStage === deal.stage) return;
    if (targetStage === 'lost') {
      setShowLostModal(true);
      return;
    }
    if (targetStage === 'won') {
      setShowWonModal(true);
      return;
    }

    const formData = new FormData();
    formData.set('deal_id', deal.id);
    formData.set('stage', targetStage);

    startTransition(async () => {
      const result = await changeDealStage(formData);
      if (result.success) {
        setSuccess(`Status changed to ${STAGE_CONFIG[targetStage]?.label || targetStage}`);
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update status');
      }
    });
  }

  function handleWonSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isWonOverpaid) {
      setError('Paid amount cannot exceed total amount.');
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set('deal_id', deal.id);
    formData.set('stage', 'won');
    formData.set('total_amount', wonTotalAmount);
    formData.set('paid_amount', wonPaidAmount);
    formData.set('payment_method', wonPaymentMethod);

    startTransition(async () => {
      const result = await changeDealStage(formData);
      if (result.success) {
        setShowWonModal(false);
        setSuccess('Deal marked as Won with payment details');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update status');
      }
    });
  }

  function handleLostSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('deal_id', deal.id);
    formData.set('stage', 'lost');

    startTransition(async () => {
      const result = await changeDealStage(formData);
      if (result.success) {
        setShowLostModal(false);
        setSuccess('Deal marked as lost');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update status');
      }
    });
  }

  function handlePaymentUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const newPaid = parseFloat(updatePaidAmount);
    if (isNaN(newPaid) || newPaid < 0) {
      setError('Paid amount must be a positive number.');
      return;
    }
    if (newPaid > dealTotal) {
      setError(`Paid amount cannot exceed total amount (${formatCurrency(dealTotal)}).`);
      return;
    }

    const formData = new FormData();
    formData.set('deal_id', deal.id);
    formData.set('paid_amount', updatePaidAmount);
    formData.set('payment_method', updatePaymentMethod);

    startTransition(async () => {
      const result = await updateDealPayment(formData);
      if (result.success) {
        setShowPaymentModal(false);
        setSuccess('Payment details updated successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to update payment');
      }
    });
  }

  function handleReassignSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set('deal_id', deal.id);

    startTransition(async () => {
      const result = await reassignDeal(formData);
      if (result.success) {
        setShowReassignModal(false);
        setSuccess('Deal reassigned successfully');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to reassign deal');
      }
    });
  }

  function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityContent.trim()) return;
    setError(null);

    const formData = new FormData();
    formData.set('deal_id', deal.id);
    formData.set('type', activityType);
    formData.set('content', activityContent.trim());

    startTransition(async () => {
      const result = await addDealActivity(formData);
      if (result.success) {
        setActivityContent('');
        setSuccess('Activity logged');
        router.refresh();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error ?? 'Failed to log activity');
      }
    });
  }

  function renderActivityIcon(type: string) {
    switch (type) {
      case 'note':
        return <MessageSquare size={14} style={{ color: 'var(--info-foreground)' }} />;
      case 'call':
        return <PhoneCall size={14} style={{ color: 'var(--success-foreground)' }} />;
      case 'email':
        return <Mail size={14} style={{ color: 'var(--info-foreground)' }} />;
      case 'meeting':
        return <Users size={14} style={{ color: 'var(--foreground)' }} />;
      case 'stage_change':
        return <ArrowRight size={14} style={{ color: 'var(--warning-foreground)' }} />;
      case 'payment_recorded':
      case 'payment_updated':
        return <Banknote size={14} style={{ color: 'var(--success-foreground)' }} />;
      default:
        return <Activity size={14} style={{ color: 'var(--muted-foreground)' }} />;
    }
  }

  const currentColors = STAGE_CONFIG[deal.stage] || { label: deal.stage, bg: 'var(--surface-muted)', text: 'var(--foreground)', border: 'var(--border)' };
  const paymentMethodLabel = PAYMENT_METHODS.find((pm) => pm.value === deal.payment_method)?.label || deal.payment_method || '—';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', color: 'var(--foreground)' }}>
      {/* Back button */}
      <Link
        href="/crm/deals"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          color: 'var(--muted-foreground)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          marginBottom: '1rem',
        }}
      >
        <ChevronLeft size={16} />
        Back to Deals
      </Link>

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

      {/* Deal Overview Card */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1.75rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.025em', margin: 0 }}>
                {deal.title}
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  background: currentColors.bg,
                  color: currentColors.text,
                  border: `1px solid ${currentColors.border || 'transparent'}`,
                }}
              >
                {currentColors.label}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.875rem' }}>
              <Link
                href={`/crm/customers/${deal.customer_id}`}
                style={{ color: 'var(--foreground)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <Building size={14} style={{ color: 'var(--muted-foreground)' }} />
                {deal.customer?.full_name}
              </Link>
              <span style={{ color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <UserCheck size={14} style={{ color: 'var(--muted-foreground)' }} />
                Rep: <strong style={{ color: 'var(--foreground)' }}>{deal.assigned_to_employee?.full_name}</strong>
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
              Total Deal Amount
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>
              {formatCurrency(dealTotal)}
            </div>
            {canReassign && (
              <button
                onClick={() => setShowReassignModal(true)}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  background: 'var(--accent)',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <UserCheck size={12} />
                Reassign Deal
              </button>
            )}
          </div>
        </div>

        {/* Status Progression Bar */}
        {canWrite && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.625rem' }}>
              Deal Status
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.5rem',
              }}
            >
              {STAGES.map((s) => {
                const isCurrentActive =
                  deal.stage === s.value ||
                  (s.value === 'follow_up' && ['contacted', 'qualified', 'proposal', 'negotiation'].includes(deal.stage));
                const colors = STAGE_CONFIG[s.value];

                return (
                  <button
                    key={s.value}
                    disabled={isPending}
                    onClick={() => handleStageClick(s.value)}
                    style={{
                      padding: '0.625rem 0.5rem',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.8125rem',
                      fontWeight: isCurrentActive ? 700 : 500,
                      background: isCurrentActive ? colors.bg : 'var(--surface-muted)',
                      border: isCurrentActive ? `1px solid ${colors.border || 'transparent'}` : '1px solid var(--border)',
                      color: isCurrentActive ? colors.text : 'var(--muted-foreground)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'center',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Financial Information Card (Won deals) */}
        {deal.stage === 'won' && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius)',
              background: 'var(--success)',
              border: '1px solid var(--success-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-foreground)', fontWeight: 600, fontSize: '0.9375rem' }}>
                <Banknote size={18} />
                Payment &amp; Financial Breakdown (EGP)
              </div>
              {canWrite && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: 'var(--radius)',
                    background: 'var(--primary)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  <CreditCard size={13} />
                  Update Payment
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'var(--card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Total Amount</span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  {formatCurrency(dealTotal)}
                </span>
              </div>

              <div style={{ background: 'var(--card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Paid Amount</span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success-foreground)' }}>
                  {formatCurrency(dealPaid)}
                </span>
              </div>

              <div style={{ background: 'var(--card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Remaining Balance</span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: dealRemaining > 0 ? 'var(--warning-foreground)' : 'var(--success-foreground)' }}>
                  {formatCurrency(dealRemaining)}
                </span>
              </div>

              <div style={{ background: 'var(--card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Payment Method</span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  {paymentMethodLabel}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Lost Reason Display (if lost) */}
        {deal.stage === 'lost' && deal.lost_reason && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius)',
              background: 'var(--destructive)',
              border: '1px solid var(--destructive-border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} style={{ color: 'var(--destructive-foreground)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--destructive-foreground)' }}>Lost Reason</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--destructive-foreground)', marginTop: '0.125rem' }}>
                {deal.lost_reason}
              </div>
            </div>
          </div>
        )}

        {/* Deal Details & Notes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.8125rem',
          }}
        >
          <div>
            <span style={{ color: 'var(--muted-foreground)', display: 'block' }}>Expected Close Date</span>
            <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
              {deal.expected_close_date ? formatDate(deal.expected_close_date) : 'Not specified'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--muted-foreground)', display: 'block' }}>Created Date</span>
            <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{formatDate(deal.created_at)}</span>
          </div>
          {deal.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--muted-foreground)', display: 'block', marginBottom: '0.25rem' }}>Notes</span>
              <p style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap', margin: 0 }}>{deal.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity Timeline Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '1.25rem' }}>
            Activity Timeline ({deal.activities?.length || 0})
          </h2>

          {/* Add Activity Form */}
          {canWrite && (
            <form onSubmit={handleAddActivity} style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  {(['note', 'call', 'email', 'meeting'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setActivityType(t)}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.75rem',
                        fontWeight: activityType === t ? 600 : 400,
                        background: activityType === t ? 'var(--primary)' : 'var(--card)',
                        border: activityType === t ? '1px solid rgba(174, 172, 120, 0.4)' : '1px solid var(--border)',
                        color: activityType === t ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                  placeholder={`Log a ${activityType} regarding this deal...`}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--foreground)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    disabled={isPending || !activityContent.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.375rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      background: 'var(--primary)',
                      border: '1px solid rgba(174, 172, 120, 0.4)',
                      color: 'var(--primary-foreground)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: !activityContent.trim() ? 0.5 : 1,
                      boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                    }}
                  >
                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Post Activity
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Timeline Stream */}
          {(!deal.activities || deal.activities.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
              No activities logged yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {deal.activities.map((act) => (
                <div
                  key={act.id}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.875rem',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {renderActivityIcon(act.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        {act.type.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        {formatDateTime(act.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                      {act.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Won Stage Settlement Modal */}
      {showWonModal && (
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
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Banknote size={20} style={{ color: 'var(--success-foreground)' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Mark Deal as Won</h2>
              </div>
              <button
                onClick={() => setShowWonModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleWonSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                      Total Amount (EGP) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={wonTotalAmount}
                      onChange={(e) => setWonTotalAmount(e.target.value)}
                      placeholder="e.g. 20000"
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
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-muted)',
                        border: `1px solid ${isWonOverpaid ? 'var(--destructive-border)' : 'var(--border)'}`,
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Remaining Amount (EGP)
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={formatCurrency(wonRemainingAmount)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
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
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                    Payment Method *
                  </label>
                  <select
                    value={wonPaymentMethod}
                    onChange={(e) => setWonPaymentMethod(e.target.value as PaymentMethod)}
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
                  onClick={() => setShowWonModal(false)}
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
                  disabled={isPending || isWonOverpaid}
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
                    cursor: isWonOverpaid ? 'not-allowed' : 'pointer',
                    opacity: isWonOverpaid ? 0.6 : 1,
                    boxShadow: '0 2px 6px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirm Won Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Payment Modal (for already Won deals) */}
      {showPaymentModal && (
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
                <CreditCard size={18} style={{ color: 'var(--success-foreground)' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Update Payment Details</h2>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePaymentUpdateSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    <strong style={{ color: 'var(--foreground)' }}>{formatCurrency(dealTotal)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Previously Paid:</span>
                    <span style={{ color: 'var(--success-foreground)', fontWeight: 600 }}>{formatCurrency(dealPaid)}</span>
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
                    value={formatCurrency(Math.max(0, dealTotal - (parseFloat(updatePaidAmount) || 0)))}
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
                  onClick={() => setShowPaymentModal(false)}
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

      {/* Lost Reason Modal */}
      {showLostModal && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Mark Deal as Lost</h2>
              <button
                onClick={() => setShowLostModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLostSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--destructive-foreground)', marginBottom: '0.375rem' }}>
                  Reason for Loss (Mandatory) *
                </label>
                <textarea
                  name="lost_reason"
                  required
                  rows={3}
                  placeholder="Specify why the deal was not closed..."
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowLostModal(false)}
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
                    background: 'var(--destructive)',
                    border: '1px solid var(--destructive-border)',
                    color: 'var(--destructive-foreground)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  Confirm Lost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Reassign Deal</h2>
              <button
                onClick={() => setShowReassignModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassignSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                  Select New Assignee *
                </label>
                <select
                  name="assigned_to"
                  required
                  defaultValue={deal.assigned_to}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
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
