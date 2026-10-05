// src/app/(dashboard)/crm/inbox/inbox-client.tsx
// Phase 4A: Unified Inbox 3-pane responsive interface.
// Left: Conversation List & Filters
// Center: Message History & Interactive Composer
// Right: Customer & Lead Context Sidebar with Linking

'use client';

import React, { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  User,
  Check,
  CheckCheck,
  Sparkles,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  X,
} from 'lucide-react';
import type {
  CurrentUser,
  ConversationWithDetails,
  ConversationStatus,
  Customer,
  Message,
  ChannelType,
} from '@/types';
import {
  getConversations,
  getConversationDetails,
  sendOutboundReply,
  updateConversationStatus,
  linkConversationCustomer,
  simulateInboundMessage,
} from '../inbox-actions';
import { createClient } from '@/lib/supabase/client';

interface InboxClientProps {
  initialConversations: ConversationWithDetails[];
  customers: Customer[];
  user: CurrentUser;
}

const CHANNEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  whatsapp: { bg: 'rgba(37, 211, 102, 0.12)', text: '#25D366', border: 'rgba(37, 211, 102, 0.3)' },
  instagram: { bg: 'rgba(225, 48, 108, 0.12)', text: '#E1306C', border: 'rgba(225, 48, 108, 0.3)' },
  messenger: { bg: 'rgba(0, 132, 255, 0.12)', text: '#0084FF', border: 'rgba(0, 132, 255, 0.3)' },
  mock: { bg: 'rgba(168, 85, 247, 0.12)', text: '#A855F7', border: 'rgba(168, 85, 247, 0.3)' },
  other: { bg: 'rgba(148, 163, 184, 0.12)', text: '#94A3B8', border: 'rgba(148, 163, 184, 0.3)' },
};

export function InboxClient({ initialConversations, customers, user }: InboxClientProps) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(initialConversations);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [activeConv, setActiveConv] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Keep latest refs for realtime callbacks without recreating channels
  const selectedConvIdRef = useRef<string | null>(selectedConvId);
  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  const filtersRef = useRef({ channel: channelFilter, status: statusFilter, search: searchTerm });
  useEffect(() => {
    filtersRef.current = { channel: channelFilter, status: statusFilter, search: searchTerm };
  }, [channelFilter, statusFilter, searchTerm]);

  // Link Customer state
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Simulate Inbound Message state
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);
  const [simChannel, setSimChannel] = useState<ChannelType>('whatsapp');
  const [simSender, setSimSender] = useState<string>('Ahmed Customer');
  const [simPhone, setSimPhone] = useState<string>('+201012345678');
  const [simContent, setSimContent] = useState<string>('Hello, I am inquiring about your services.');

  const isAdmin = user.permissions.includes('crm.inbox.read_all') || user.permissions.includes('admin.system');

  // Load selected conversation details
  const loadConversationDetails = useCallback(async (convId: string) => {
    const data = await getConversationDetails(convId);
    if (data && selectedConvIdRef.current === convId) {
      setActiveConv(data);
      setMessages(data.messages || []);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadConversationDetails(selectedConvId);
    }
  }, [selectedConvId, loadConversationDetails]);

  // Refresh conversation list without resetting WebSocket connections
  const refreshConversations = useCallback(async (autoSelectIfNone = false) => {
    try {
      const data = await getConversations({
        channel: filtersRef.current.channel,
        status: filtersRef.current.status,
        search: filtersRef.current.search,
      });
      setConversations(data);
      setSelectedConvId((currentSelected) => {
        if ((autoSelectIfNone || !currentSelected) && data.length > 0) {
          return currentSelected && data.some((c) => c.id === currentSelected) ? currentSelected : data[0].id;
        }
        if (currentSelected && !data.some((c) => c.id === currentSelected) && data.length > 0) {
          return data[0].id;
        }
        return currentSelected;
      });
    } catch (err) {
      console.error('[Inbox] Error fetching conversations:', err);
    }
  }, []);

  // Filter & search changes trigger conversation refresh
  useEffect(() => {
    startTransition(() => {
      refreshConversations(false);
    });
  }, [channelFilter, statusFilter, searchTerm, refreshConversations]);

  // Supabase Realtime Subscription (Connected ONCE on mount, zero memory leaks)
  useEffect(() => {
    const supabase = createClient();

    const handleMessageEvent = async (payload: { new?: unknown }) => {
      const newMsg = payload.new as Message | undefined;
      if (!newMsg || !newMsg.id) return;

      // 1. If new message belongs to currently active thread, update messages array in real time
      if (newMsg.conversation_id === selectedConvIdRef.current) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) =>
              m.id === newMsg.id ||
              (newMsg.external_message_id && m.external_message_id === newMsg.external_message_id)
          );
          if (exists) {
            return prev.map((m) =>
              m.id === newMsg.id ||
              (newMsg.external_message_id && m.external_message_id === newMsg.external_message_id)
                ? newMsg
                : m
            );
          }
          return [...prev, newMsg];
        });
      }

      // 2. Refresh conversation previews, timestamps, and unread counts immediately
      await refreshConversations(false);
    };

    const handleConversationEvent = async (payload: { new?: unknown }) => {
      // Refresh list and auto-select if no conversation was previously open
      await refreshConversations(true);

      const newConv = payload.new as ConversationWithDetails | undefined;
      if (newConv && selectedConvIdRef.current === newConv.id) {
        loadConversationDetails(newConv.id);
      }
    };

    const channel = supabase
      .channel('inbox-realtime-singleton')
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'messages' },
        (payload) => {
          handleMessageEvent(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'conversations' },
        (payload) => {
          handleConversationEvent(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          handleMessageEvent(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          handleConversationEvent(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshConversations, loadConversationDetails]);

  // Background Outbound Message Dispatcher (Non-blocking)
  const dispatchOutboundMessage = useCallback(async (convId: string, content: string, tempId: string) => {
    const res = await sendOutboundReply({
      conversation_id: convId,
      content,
    });

    if (res.success && res.data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? res.data! : m))
      );
      setActiveConv((prev) =>
        prev && prev.id === convId
          ? {
              ...prev,
              last_message_at: res.data!.created_at,
              last_message_preview: content.slice(0, 100),
            }
          : prev
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                last_message_at: res.data!.created_at,
                last_message_preview: content.slice(0, 100),
              }
            : c
        )
      );
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                status: 'failed',
                error_detail: res.error || 'Failed to deliver message',
              }
            : m
        )
      );
    }
  }, []);

  // Handle Send Reply (Instant 0ms Optimistic UI)
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = replyText.trim();
    if (!selectedConvId || !content) return;

    const tempId = `temp_msg_${Date.now()}_${Math.random()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: selectedConvId,
      direction: 'outbound',
      sender_type: 'employee',
      sender_employee_id: user.employee?.id || null,
      content,
      media_url: null,
      message_type: 'text',
      status: 'sending',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      error_detail: null,
      raw_event_id: null,
      external_message_id: null,
    };

    // 1. Instant UI update (0ms delay)
    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyText('');
    setErrorMsg(null);

    // Update active conversation & list preview locally
    setActiveConv((prev) =>
      prev
        ? {
            ...prev,
            last_message_at: optimisticMsg.created_at,
            last_message_preview: content.slice(0, 100),
          }
        : null
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConvId
          ? {
              ...c,
              last_message_at: optimisticMsg.created_at,
              last_message_preview: content.slice(0, 100),
            }
          : c
      )
    );

    // 2. Dispatch background server action without blocking UI typing
    dispatchOutboundMessage(selectedConvId, content, tempId);
  };

  // Handle Retry Failed Outbound Message
  const handleRetryMessage = async (msgToRetry: Message) => {
    if (!selectedConvId || msgToRetry.direction !== 'outbound' || !msgToRetry.content) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgToRetry.id
          ? { ...m, status: 'sending', error_detail: null }
          : m
      )
    );

    dispatchOutboundMessage(selectedConvId, msgToRetry.content, msgToRetry.id);
  };

  // Handle Status Change
  const handleStatusChange = async (newStatus: ConversationStatus) => {
    if (!selectedConvId) return;
    const res = await updateConversationStatus({
      conversation_id: selectedConvId,
      status: newStatus,
    });
    if (res.success) {
      setActiveConv((prev) => (prev ? { ...prev, status: newStatus } : null));
      refreshConversations();
    }
  };

  // Handle Link Customer
  const handleLinkCustomer = async () => {
    if (!selectedConvId || !selectedCustomerId) return;
    const res = await linkConversationCustomer({
      conversation_id: selectedConvId,
      customer_id: selectedCustomerId,
    });

    if (res.success) {
      setShowLinkModal(false);
      const updated = await getConversationDetails(selectedConvId);
      if (updated) setActiveConv(updated);
      refreshConversations();
    } else {
      setErrorMsg(res.error || 'Failed to link customer');
    }
  };

  // Handle Simulate Inbound Message
  const handleSimulateMessage = async () => {
    const res = await simulateInboundMessage({
      channel: simChannel,
      external_id: simPhone.trim() || `mock_${Date.now()}`,
      display_name: simSender.trim() || 'Simulated Customer',
      phone: simPhone.trim(),
      content: simContent.trim(),
    });

    if (res.success) {
      setShowSimulateModal(false);
      refreshConversations();
      if (res.data?.conversation_id) {
        setSelectedConvId(res.data.conversation_id);
      }
    } else {
      setErrorMsg(res.error || 'Simulation failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', background: '#0F172A', color: '#F8FAFC' }}>
      {/* Top Banner / Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1E293B' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare size={22} style={{ color: '#38BDF8' }} />
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Unified Messaging Inbox</h1>
          <span style={{ fontSize: '12px', background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
            Phase 4A
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setShowSimulateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: '#FFF',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} /> Simulate Inbound Message
          </button>
          <button
            onClick={() => refreshConversations(false)}
            disabled={isPending}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#CBD5E1',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Refresh Conversations"
          >
            <RefreshCw size={15} style={{ animation: isPending ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', borderLeft: '4px solid #EF4444', color: '#FCA5A5', padding: '8px 16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3-Pane Responsive Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ─── PANE 1: Conversation List (320px) ────────────────── */}
        <div style={{ width: '320px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', background: '#111827' }}>
          {/* Filters & Search */}
          <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748B' }} />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '7px 10px 7px 32px',
                  color: '#FFF',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Channel Filters */}
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '8px' }}>
              {['all', 'whatsapp', 'instagram', 'messenger', 'mock'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  style={{
                    background: channelFilter === ch ? '#38BDF8' : 'rgba(255,255,255,0.05)',
                    color: channelFilter === ch ? '#0F172A' : '#94A3B8',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '4px', fontSize: '11px' }}>
              {['all', 'open', 'closed', ...(isAdmin ? ['pending_assignment'] : [])].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    background: statusFilter === st ? 'rgba(255,255,255,0.15)' : 'transparent',
                    color: statusFilter === st ? '#F8FAFC' : '#64748B',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Cards List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                No conversations found.
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const chColor = CHANNEL_COLORS[conv.channel] || CHANNEL_COLORS.other;

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #38BDF8' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            background: chColor.bg,
                            color: chColor.text,
                            border: `1px solid ${chColor.border}`,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {conv.channel}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#F1F5F9' }}>
                          {conv.channel_identity?.display_name || conv.channel_identity?.phone || 'Unknown Contact'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>
                        {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '210px' }}>
                        {conv.last_message_preview || 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span style={{ background: '#38BDF8', color: '#0F172A', borderRadius: '10px', fontSize: '10px', fontWeight: 700, padding: '1px 6px' }}>
                          {conv.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Assigned Rep Badge */}
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748B' }}>
                      <User size={11} />
                      <span>{conv.assigned_to_employee?.full_name || (conv.status === 'pending_assignment' ? 'Pending Routing' : 'Unassigned')}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── PANE 2: Message Thread & Composer (Flex 1) ────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0F172A' }}>
          {activeConv ? (
            <>
              {/* Thread Header */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                      {activeConv.channel_identity?.display_name || activeConv.channel_identity?.phone || 'Contact'}
                    </h2>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>({activeConv.channel_identity?.external_id})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#94A3B8' }}>
                    <span>Rep: <strong style={{ color: '#E2E8F0' }}>{activeConv.assigned_to_employee?.full_name || (activeConv.status === 'pending_assignment' ? 'Pending Routing' : 'Unassigned')}</strong></span>
                    <span>Channel: <strong style={{ color: '#E2E8F0', textTransform: 'capitalize' }}>{activeConv.channel}</strong></span>
                  </div>
                </div>

                {/* Status Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={activeConv.status}
                    onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#FFF',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '12px',
                    }}
                  >
                    {activeConv.status === 'pending_assignment' && (
                      <option value="pending_assignment">Pending Routing</option>
                    )}
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Messages History */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                    No messages in this conversation.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isOutbound ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '65%',
                            padding: '10px 14px',
                            borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                            background: isOutbound ? '#2563EB' : 'rgba(255,255,255,0.08)',
                            color: '#F8FAFC',
                            fontSize: '13px',
                            lineHeight: 1.45,
                            border: isOutbound ? 'none' : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          {msg.content}
                          {msg.media_url && (
                            <div style={{ marginTop: '8px' }}>
                              <a href={msg.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#93C5FD', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                View Attached Media <ExternalLink size={12} />
                              </a>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '10px', color: '#64748B' }}>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isOutbound && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {msg.status === 'sending' ? (
                                <RefreshCw size={11} style={{ color: '#94A3B8', animation: 'spin 1s linear infinite' }} />
                              ) : msg.status === 'failed' ? (
                                <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertCircle size={12} />
                                  <span>Failed</span>
                                  <button
                                    onClick={() => handleRetryMessage(msg)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      border: '1px solid #EF4444',
                                      color: '#FFF',
                                      borderRadius: '4px',
                                      padding: '1px 6px',
                                      fontSize: '10px',
                                      cursor: 'pointer',
                                      marginLeft: '4px',
                                    }}
                                  >
                                    Retry
                                  </button>
                                </span>
                              ) : msg.status === 'read' ? (
                                <CheckCheck size={12} style={{ color: '#38BDF8' }} />
                              ) : msg.status === 'delivered' ? (
                                <CheckCheck size={12} />
                              ) : (
                                <Check size={12} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer */}
              <form onSubmit={handleSendReply} style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#1E293B', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Type an outbound reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={activeConv.status === 'closed'}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#FFF',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || activeConv.status === 'closed'}
                  style={{
                    background: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    opacity: replyText.trim() ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  <Send size={15} /> Send
                </button>
              </form>
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#64748B' }}>
              <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: '10px' }} />
              <p style={{ fontSize: '14px' }}>Select a conversation to start messaging</p>
            </div>
          )}
        </div>

        {/* ─── PANE 3: Context Sidebar (320px) ──────────────────── */}
        {activeConv && (
          <div style={{ width: '320px', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#111827', padding: '18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', margin: 0 }}>
              Conversation Context
            </h3>

            {/* Contact Profile */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <User size={16} style={{ color: '#38BDF8' }} />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Channel Profile</span>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#94A3B8' }}>
                <div>Display Name: <strong style={{ color: '#E2E8F0' }}>{activeConv.channel_identity?.display_name || 'N/A'}</strong></div>
                <div>Phone: <strong style={{ color: '#E2E8F0' }}>{activeConv.channel_identity?.phone || 'N/A'}</strong></div>
                <div>Platform ID: <strong style={{ color: '#E2E8F0', wordBreak: 'break-all' }}>{activeConv.channel_identity?.external_id}</strong></div>
              </div>
            </div>

            {/* Linked Customer Profile */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} style={{ color: '#10B981' }} />
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>Linked Customer</span>
                </div>
                {!activeConv.customer && (
                  <button
                    onClick={() => setShowLinkModal(true)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38BDF8',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Link Customer
                  </button>
                )}
              </div>

              {activeConv.customer ? (
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#94A3B8' }}>
                  <div>Name: <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.full_name}</strong></div>
                  <div>Phone: <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.phone || 'N/A'}</strong></div>
                  <div>Email: <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.email || 'N/A'}</strong></div>
                  <a href={`/crm/customers`} style={{ color: '#38BDF8', fontSize: '11px', marginTop: '4px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    View in Customers <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                  No customer linked yet. Strict separation active (no auto-merge by name).
                </div>
              )}
            </div>

            {/* Associated Lead Card */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Sparkles size={16} style={{ color: '#F59E0B' }} />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Active Sales Opportunity</span>
              </div>

              {activeConv.lead ? (
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#94A3B8' }}>
                  <div>Lead: <strong style={{ color: '#E2E8F0' }}>{activeConv.lead.full_name}</strong></div>
                  <div>
                    Status:{' '}
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {activeConv.lead.status}
                    </span>
                  </div>
                  <div>Source: <strong style={{ color: '#E2E8F0', textTransform: 'capitalize' }}>{activeConv.lead.source}</strong></div>
                  <div>Assigned Rep: <strong style={{ color: '#E2E8F0' }}>{activeConv.assigned_to_employee?.full_name || 'Unassigned'}</strong></div>
                  <a
                    href={`/crm/leads`}
                    style={{
                      color: '#F59E0B',
                      fontSize: '11px',
                      marginTop: '6px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Manage Lead & Convert <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                  No active lead associated with this thread.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal: Link Customer ───────────────────────────────── */}
      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', width: '420px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Link Customer to Thread</h3>
              <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              Select an existing Customer record to permanently associate with this channel identity and chat thread.
            </p>

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{ width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: '#FFF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', marginBottom: '20px' }}
            >
              <option value="">Select a customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.phone || c.email || 'No contact'})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowLinkModal(false)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1', padding: '7px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleLinkCustomer}
                disabled={!selectedCustomerId}
                style={{ background: '#38BDF8', color: '#0F172A', border: 'none', fontWeight: 600, padding: '7px 16px', borderRadius: '6px', fontSize: '13px', cursor: selectedCustomerId ? 'pointer' : 'not-allowed' }}
              >
                Confirm Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Simulate Inbound Message ────────────────────── */}
      {showSimulateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', width: '460px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: '#A855F7' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Simulate Inbound Message</h3>
              </div>
              <button onClick={() => setShowSimulateModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              Tests the full Phase 4A ingestion pipeline: raw webhook persistence, identity resolution, conversation creation, lead generation, and atomic sales routing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Channel</label>
                <select
                  value={simChannel}
                  onChange={(e) => setSimChannel(e.target.value as ChannelType)}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: '#FFF', borderRadius: '6px', padding: '8px 10px', fontSize: '13px' }}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Facebook Messenger</option>
                  <option value="mock">Mock Channel</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Sender Name</label>
                <input
                  type="text"
                  value={simSender}
                  onChange={(e) => setSimSender(e.target.value)}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: '#FFF', borderRadius: '6px', padding: '8px 10px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Phone / External ID</label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: '#FFF', borderRadius: '6px', padding: '8px 10px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#CBD5E1', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Message Content</label>
                <textarea
                  value={simContent}
                  onChange={(e) => setSimContent(e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: '#FFF', borderRadius: '6px', padding: '8px 10px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowSimulateModal(false)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1', padding: '7px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSimulateMessage}
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#FFF', border: 'none', fontWeight: 600, padding: '7px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Dispatch Inbound Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
