// src/app/(dashboard)/crm/leads/leads-client.tsx
// Phase 3: Leads list client component.
// Shows incoming leads, assignment info, today's count, and create/status/reassign actions.
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createLead, updateLeadStatus, reassignLead } from '../lead-actions';
import { formatDateTime } from '@/lib/utils';
import type { LeadWithAssignee, Employee, CurrentUser, LeadStatus } from '@/types';
import { hasPermission, hasAnyPermission } from '@/lib/auth/client-helpers';
import {
  Plus,
  Inbox,
  Search,
  Filter,
  X,
  Loader2,
  Phone,
  Mail,
  UserCheck,
  ArrowRightCircle,
  Calendar,
} from 'lucide-react';

interface LeadsClientProps {
  leads: LeadWithAssignee[];
  assignees: Employee[];
  user: CurrentUser;
  todayCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  in_progress: { label: 'In Progress', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  follow_up: { label: 'Follow Up', bg: 'var(--warning)', text: 'var(--warning-foreground)', border: 'var(--warning-border)' },
  won: { label: 'Won', bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lose: { label: 'Lose', bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
  new: { label: 'In Progress', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  contacted: { label: 'In Progress', bg: 'var(--info)', text: 'var(--info-foreground)', border: 'var(--info-border)' },
  converted: { label: 'Won', bg: 'var(--success)', text: 'var(--success-foreground)', border: 'var(--success-border)' },
  lost: { label: 'Lose', bg: 'var(--destructive)', text: 'var(--destructive-foreground)', border: 'var(--destructive-border)' },
};

const LEAD_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'won', label: 'Won' },
  { value: 'lose', label: 'Lose' },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  referral: 'Referral',
  walk_in: 'Walk-in',
  website: 'Website',
  social_media: 'Social Media',
  whatsapp: 'WhatsApp',
  phone_call: 'Phone Call',
  other: 'Other',
};

export function LeadsClient({ leads, assignees, user, todayCount }: LeadsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // UI state
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Follow-up modal state
  const [followUpModal, setFollowUpModal] = useState<{ leadId: string } | null>(null);
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  // Create form state
  const [createForm, setCreateForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    source: 'manual',
    notes: '',
  });

  const canWrite = hasAnyPermission(user, ['crm.leads.write']);
  const canReadAll = hasPermission(user, 'crm.leads.read_all');
  const isSales = user.roles.some((r) => r.name === 'Sales');

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        lead.full_name.toLowerCase().includes(q) ||
        (lead.phone && lead.phone.includes(q)) ||
        (lead.email && lead.email.toLowerCase().includes(q))
      );
    }
    return true;
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('full_name', createForm.full_name);
    formData.set('phone', createForm.phone);
    formData.set('email', createForm.email);
    formData.set('source', createForm.source);
    formData.set('notes', createForm.notes);

    startTransition(async () => {
      const result = await createLead(formData);
      if (result.success) {
        setSuccess('Lead created and assigned successfully!');
        setCreateForm({ full_name: '', phone: '', email: '', source: 'manual', notes: '' });
        setShowCreate(false);
        router.refresh();
      } else {
        setError(result.error || 'Failed to create lead');
      }
    });
  }

  function handleStatusSelect(leadId: string, newStatus: LeadStatus) {
    if (newStatus === 'follow_up') {
      setFollowUpModal({ leadId });
      setFollowUpAt('');
      setFollowUpNotes('');
      return;
    }
    handleStatusChange(leadId, newStatus);
  }

  function handleStatusChange(leadId: string, newStatus: LeadStatus, dateStr?: string, notesStr?: string) {
    setError(null);
    const formData = new FormData();
    formData.set('lead_id', leadId);
    formData.set('status', newStatus);
    if (dateStr) formData.set('follow_up_at', dateStr);
    if (notesStr) formData.set('notes', notesStr);

    startTransition(async () => {
      const result = await updateLeadStatus(formData);
      if (!result.success) {
        setError(result.error || 'Failed to update status');
      }
      router.refresh();
    });
  }

  function handleFollowUpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpModal || !followUpAt) {
      setError('Follow-up date and time is required');
      return;
    }
    const isoDate = new Date(followUpAt).toISOString();
    handleStatusChange(followUpModal.leadId, 'follow_up', isoDate, followUpNotes);
    setFollowUpModal(null);
  }

  function handleReassign(leadId: string, employeeId: string) {
    setError(null);
    const formData = new FormData();
    formData.set('lead_id', leadId);
    formData.set('assigned_to', employeeId);

    startTransition(async () => {
      const result = await reassignLead(formData);
      if (!result.success) {
        setError(result.error || 'Failed to reassign lead');
      }
      router.refresh();
    });
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', color: 'var(--foreground)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
            <Inbox size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.02em' }}>
              Leads
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0 }}>
              Incoming inquiries &amp; automatic assignment
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Today's count badge */}
          {(isSales || canReadAll) && (
            <div
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '999px',
                backgroundColor: 'var(--accent)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              Today&apos;s Leads: {todayCount}
            </div>
          )}

          {canWrite && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(174, 172, 120, 0.4)',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
            >
              <Plus size={18} />
              New Lead
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--destructive)',
            border: '1px solid var(--destructive-border)',
            color: 'var(--destructive-foreground)',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--success)',
            border: '1px solid var(--success-border)',
            color: 'var(--success-foreground)',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {success}
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            flex: '1 1 300px',
            boxShadow: '0 1px 2px rgba(76, 69, 65, 0.03)',
          }}
        >
          <Search size={16} style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              flex: 1,
              fontSize: '0.875rem',
              background: 'transparent',
              color: 'var(--foreground)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: '0 1px 2px rgba(76, 69, 65, 0.03)',
          }}
        >
          <Filter size={16} style={{ color: 'var(--muted-foreground)' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            {LEAD_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Create Lead Modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              padding: '2rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>New Lead</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box',
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
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--foreground)',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box',
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

                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                    Source
                  </label>
                  <select
                    value={createForm.source}
                    onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
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
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                    Notes
                  </label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
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

                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                  The lead will be automatically assigned to an available Sales employee.
                </p>

                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    opacity: isPending ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                  }}
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {isPending ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Follow Up Modal */}
      {followUpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76, 69, 65, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFollowUpModal(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              padding: '2rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(76, 69, 65, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} style={{ color: 'var(--warning-foreground)' }} />
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Schedule Follow Up</h2>
              </div>
              <button onClick={() => setFollowUpModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFollowUpSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                    Follow-Up Date &amp; Time (Cairo Time) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem', marginBottom: 0 }}>
                    Required. A reminder notification will be triggered when this time arrives.
                  </p>
                </div>

                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                    Follow-Up Notes (Optional)
                  </label>
                  <textarea
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Customer asked to call back tomorrow afternoon"
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setFollowUpModal(null)}
                    style={{
                      padding: '0.625rem 1rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--foreground)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !followUpAt}
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid rgba(174, 172, 120, 0.4)',
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-foreground)',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: isPending || !followUpAt ? 'not-allowed' : 'pointer',
                      opacity: isPending || !followUpAt ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                    Save Follow Up
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div
        style={{
          backgroundColor: 'var(--card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
        }}
      >
        {filteredLeads.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--muted-foreground)',
            }}
          >
            <Inbox size={48} style={{ color: 'var(--olive)', opacity: 0.5, marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--foreground)' }}>
              {leads.length === 0 ? 'No leads yet' : 'No matching leads'}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
              {leads.length === 0
                ? 'Create your first lead to get started.'
                : 'Try adjusting your search or filter.'}
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
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Name
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Contact
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Source
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Assigned To
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Created
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const statusInfo = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new;
                  return (
                    <tr
                      key={lead.id}
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
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--foreground)' }}>
                        {lead.full_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {lead.phone && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                              <Phone size={12} style={{ color: 'var(--olive)' }} /> {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                              <Mail size={12} style={{ color: 'var(--olive)' }} /> {lead.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--foreground)' }}>
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: statusInfo.bg,
                              color: statusInfo.text,
                              border: `1px solid ${statusInfo.border}`,
                              width: 'fit-content',
                            }}
                          >
                            {statusInfo.label}
                          </span>
                          {lead.status === 'follow_up' && lead.follow_up_at && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={12} style={{ color: 'var(--warning-foreground)' }} />
                              {new Date(lead.follow_up_at).toLocaleString('en-US', { timeZone: 'Africa/Cairo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} (Cairo)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {lead.assigned_to_employee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <UserCheck size={14} style={{ color: 'var(--success-foreground)' }} />
                            <span style={{ fontSize: '0.8125rem', color: 'var(--foreground)' }}>
                              {lead.assigned_to_employee.full_name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--destructive-foreground)', fontStyle: 'italic' }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                        {formatDateTime(lead.created_at)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                          {/* Status change dropdown */}
                          {canWrite && lead.status !== 'won' && (
                            <select
                              value={lead.status}
                              onChange={(e) => handleStatusSelect(lead.id, e.target.value as LeadStatus)}
                              disabled={isPending}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                fontSize: '0.75rem',
                                backgroundColor: 'var(--surface)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                              }}
                              title="Change status"
                            >
                              <option value="in_progress">In Progress</option>
                              <option value="follow_up">Follow Up</option>
                              <option value="won">Won</option>
                              <option value="lose">Lose</option>
                            </select>
                          )}

                          {/* Reassign (admin only) */}
                          {canReadAll && (
                            <select
                              value={lead.assigned_to ?? ''}
                              onChange={(e) => {
                                if (e.target.value) handleReassign(lead.id, e.target.value);
                              }}
                              disabled={isPending}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                fontSize: '0.75rem',
                                backgroundColor: 'var(--surface)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                                maxWidth: '120px',
                              }}
                              title="Reassign lead"
                            >
                              <option value="">Reassign...</option>
                              {assignees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.full_name}
                                </option>
                              ))}
                            </select>
                          )}

                          {(lead.status === 'won' || (lead.status as string) === 'converted') && lead.converted_to_deal_id && (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                color: 'var(--success-foreground)',
                              }}
                            >
                              <ArrowRightCircle size={14} />
                              Deal
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1rem',
          fontSize: '0.8125rem',
          color: 'var(--muted-foreground)',
        }}
      >
        <span>
          Showing {filteredLeads.length} of {leads.length} leads
        </span>
      </div>
    </div>
  );
}
