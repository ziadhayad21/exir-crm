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
} from 'lucide-react';

interface LeadsClientProps {
  leads: LeadWithAssignee[];
  assignees: Employee[];
  user: CurrentUser;
  todayCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'hsla(217 91% 60% / 0.15)', text: 'hsl(217 91% 70%)' },
  contacted: { label: 'Contacted', bg: 'hsla(38 92% 50% / 0.15)', text: 'hsl(38 92% 65%)' },
  converted: { label: 'Converted', bg: 'hsla(142 76% 36% / 0.15)', text: 'hsl(142 76% 65%)' },
  lost: { label: 'Lost', bg: 'hsla(0 84% 60% / 0.15)', text: 'hsl(0 84% 75%)' },
};

const LEAD_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
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

  function handleStatusChange(leadId: string, newStatus: LeadStatus) {
    setError(null);
    const formData = new FormData();
    formData.set('lead_id', leadId);
    formData.set('status', newStatus);

    startTransition(async () => {
      const result = await updateLeadStatus(formData);
      if (!result.success) {
        setError(result.error || 'Failed to update status');
      }
      router.refresh();
    });
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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, hsl(262 83% 58%) 0%, hsl(217 91% 50%) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Inbox size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'hsl(222 47% 11%)', margin: 0 }}>
              Leads
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'hsl(220 8% 46%)', margin: 0 }}>
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
                borderRadius: '0.75rem',
                background: 'hsla(262 83% 58% / 0.1)',
                color: 'hsl(262 83% 58%)',
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
                borderRadius: '0.75rem',
                border: 'none',
                background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px hsla(217 91% 50% / 0.25)',
              }}
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
            borderRadius: '0.75rem',
            background: 'hsla(0 84% 60% / 0.1)',
            color: 'hsl(0 84% 40%)',
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
            borderRadius: '0.75rem',
            background: 'hsla(142 76% 36% / 0.1)',
            color: 'hsl(142 76% 26%)',
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
            borderRadius: '0.75rem',
            background: 'white',
            border: '1px solid hsl(220 13% 91%)',
            flex: '1 1 300px',
          }}
        >
          <Search size={16} style={{ color: 'hsl(220 8% 46%)' }} />
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
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.75rem',
            background: 'white',
            border: '1px solid hsl(220 13% 91%)',
          }}
        >
          <Filter size={16} style={{ color: 'hsl(220 8% 46%)' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              background: 'transparent',
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
            background: 'hsla(0 0% 0% / 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '2rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 60px hsla(0 0% 0% / 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'hsl(222 47% 11%)', margin: 0 }}>New Lead</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} style={{ color: 'hsl(220 8% 46%)' }} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 8% 46%)', display: 'block', marginBottom: '0.25rem' }}>
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
                      borderRadius: '0.5rem',
                      border: '1px solid hsl(220 13% 91%)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 8% 46%)', display: 'block', marginBottom: '0.25rem' }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.5rem',
                        border: '1px solid hsl(220 13% 91%)',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 8% 46%)', display: 'block', marginBottom: '0.25rem' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.5rem',
                        border: '1px solid hsl(220 13% 91%)',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 8% 46%)', display: 'block', marginBottom: '0.25rem' }}>
                    Source
                  </label>
                  <select
                    value={createForm.source}
                    onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: '0.5rem',
                      border: '1px solid hsl(220 13% 91%)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      background: 'white',
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
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(220 8% 46%)', display: 'block', marginBottom: '0.25rem' }}>
                    Notes
                  </label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      borderRadius: '0.5rem',
                      border: '1px solid hsl(220 13% 91%)',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <p style={{ fontSize: '0.75rem', color: 'hsl(220 8% 56%)', margin: 0 }}>
                  The lead will be automatically assigned to an available Sales employee.
                </p>

                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    opacity: isPending ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
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

      {/* Leads Table */}
      <div
        style={{
          background: 'white',
          borderRadius: '1rem',
          border: '1px solid hsl(220 13% 91%)',
          overflow: 'hidden',
        }}
      >
        {filteredLeads.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'hsl(220 8% 46%)',
            }}
          >
            <Inbox size={48} style={{ color: 'hsl(220 13% 91%)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>
              {leads.length === 0 ? 'No leads yet' : 'No matching leads'}
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
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
                    background: 'hsl(220 14% 96%)',
                    borderBottom: '1px solid hsl(220 13% 91%)',
                  }}
                >
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Name
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Contact
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Source
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Assigned To
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
                    Created
                  </th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: 'hsl(220 8% 46%)' }}>
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
                        borderBottom: '1px solid hsl(220 13% 95%)',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'hsl(220 14% 98%)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'hsl(222 47% 11%)' }}>
                        {lead.full_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {lead.phone && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', color: 'hsl(220 8% 46%)' }}>
                              <Phone size={12} /> {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', color: 'hsl(220 8% 46%)' }}>
                              <Mail size={12} /> {lead.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'hsl(220 8% 46%)' }}>
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: statusInfo.bg,
                            color: statusInfo.text,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {lead.assigned_to_employee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <UserCheck size={14} style={{ color: 'hsl(142 76% 36%)' }} />
                            <span style={{ fontSize: '0.8125rem', color: 'hsl(222 47% 11%)' }}>
                              {lead.assigned_to_employee.full_name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: 'hsl(0 84% 60%)', fontStyle: 'italic' }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'hsl(220 8% 46%)' }}>
                        {formatDateTime(lead.created_at)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                          {/* Status change dropdown */}
                          {canWrite && lead.status !== 'converted' && (
                            <select
                              value={lead.status}
                              onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                              disabled={isPending}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid hsl(220 13% 91%)',
                                fontSize: '0.75rem',
                                background: 'white',
                                cursor: 'pointer',
                              }}
                              title="Change status"
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="converted">Converted</option>
                              <option value="lost">Lost</option>
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
                                borderRadius: '0.375rem',
                                border: '1px solid hsl(220 13% 91%)',
                                fontSize: '0.75rem',
                                background: 'white',
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

                          {lead.status === 'converted' && lead.converted_to_deal_id && (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                color: 'hsl(142 76% 36%)',
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
          color: 'hsl(220 8% 46%)',
        }}
      >
        <span>
          Showing {filteredLeads.length} of {leads.length} leads
        </span>
      </div>
    </div>
  );
}
