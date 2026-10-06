// src/app/(dashboard)/crm/inbox/inbox-client.tsx
// Unified Messaging Inbox: WhatsApp Web-style instant switching 3-pane interface.
// Left: Conversation List, Search, Channel & Status Filters, Realtime Inbound Updates & Unread Badges
// Center: Message History, Delivery Statuses, Date Separators, Auto-scroll & Multi-line Composer
// Right: Customer Profile, Channel Identity, Linked Customer & Sales Lead Context

'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useTransition, useCallback, useRef, useMemo } from 'react';
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
  Clock,
  Layers,
  Copy,
  CheckCircle2,
  Paperclip,
  FileText,
  Film,
  Music,
  Download,
  Trash2,
} from 'lucide-react';
import type {
  CurrentUser,
  ConversationWithDetails,
  ConversationStatus,
  Customer,
  Message,
  ChannelType,
  MessageAttachment,
} from '@/types';
import {
  getConversations,
  getConversationDetails,
  getMessages,
  sendOutboundReply,
  createMediaUploadUrl,
  finalizeOutboundMediaReply,
  retryOutboundMediaReply,
  getMediaSignedUrl,
  updateConversationStatus,
  linkConversationCustomer,
  simulateInboundMessage,
  markConversationAsRead,
} from '../inbox-actions';
import { createClient } from '@/lib/supabase/client';
import { resolveConversationDisplayName, mergeMessages } from '@/lib/utils';

function safeMediaUrl(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return '#';
}

export interface MessageCacheEntry {
  messages: Message[];
  fetchedAt: number;
  loading: boolean;
  hasMore?: boolean;
}

interface InboxClientProps {
  initialConversations: ConversationWithDetails[];
  customers: Customer[];
  user: CurrentUser;
}

const CHANNEL_THEMES: Record<
  string,
  {
    name: string;
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
  }
> = {
  whatsapp: {
    name: 'WhatsApp',
    bg: 'rgba(37, 211, 102, 0.12)',
    text: '#25D366',
    border: 'rgba(37, 211, 102, 0.25)',
    badgeBg: '#25D366',
  },
  instagram: {
    name: 'Instagram',
    bg: 'rgba(225, 48, 108, 0.12)',
    text: '#E1306C',
    border: 'rgba(225, 48, 108, 0.25)',
    badgeBg: 'linear-gradient(135deg, #F58529, #DD2A7B, #8134AF)',
  },
  messenger: {
    name: 'Messenger',
    bg: 'rgba(0, 132, 255, 0.12)',
    text: '#0084FF',
    border: 'rgba(0, 132, 255, 0.25)',
    badgeBg: '#0084FF',
  },
  mock: {
    name: 'Mock',
    bg: 'rgba(168, 85, 247, 0.12)',
    text: '#A855F7',
    border: 'rgba(168, 85, 247, 0.25)',
    badgeBg: '#A855F7',
  },
  other: {
    name: 'Channel',
    bg: 'rgba(148, 163, 184, 0.12)',
    text: '#94A3B8',
    border: 'rgba(148, 163, 184, 0.25)',
    badgeBg: '#94A3B8',
  },
};

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveDisplayName(conv?: ConversationWithDetails | null): string {
  if (!conv) return 'Contact';
  return resolveConversationDisplayName(conv);
}

function formatDateSeparator(dateString?: string | null): string {
  if (!dateString) return 'Today';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'Today';
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatMessageTime(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InboxClient({ initialConversations, customers, user }: InboxClientProps) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(() => {
    if (initialConversations.length > 0) {
      // Optimistically zero unread for the initially open conversation
      return initialConversations.map((c, idx) => (idx === 0 ? { ...c, unread_count: 0 } : c));
    }
    return initialConversations;
  });

  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [activeConv, setActiveConv] = useState<ConversationWithDetails | null>(
    initialConversations[0] ? { ...initialConversations[0], unread_count: 0 } : null
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRightSidebar, setShowRightSidebar] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Phase 4E: Outbound media attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileMediaType, setFileMediaType] = useState<'image' | 'video' | 'audio' | 'document' | null>(null);
  const [previewModalAttachment, setPreviewModalAttachment] = useState<{
    url: string;
    title: string;
    type: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const detectClientMediaType = (file: File): 'image' | 'video' | 'audio' | 'document' | null => {
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/.test(name)) return 'image';
    if (mime.startsWith('video/') || /\.(mp4|quicktime|webm|mov)$/.test(name)) return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/.test(name)) return 'audio';
    if (
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.includes('sheet') ||
      mime.includes('text') ||
      /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/.test(name)
    ) {
      return 'document';
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.msi', '.vbs', '.js', '.sh', '.py', '.php', '.html', '.svg'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      setErrorMsg(`File extension "${ext}" is restricted for security.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const detectedType = detectClientMediaType(file);
    if (!detectedType) {
      setErrorMsg('Unsupported file format. Please upload an Image, PDF, Document, Audio, or Video.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxSizes: Record<string, number> = {
      image: 20 * 1024 * 1024,
      audio: 25 * 1024 * 1024,
      video: 50 * 1024 * 1024,
      document: 50 * 1024 * 1024,
    };

    if (file.size > maxSizes[detectedType]) {
      setErrorMsg(`File exceeds maximum size limit of ${Math.round(maxSizes[detectedType] / (1024 * 1024))}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    setSelectedFile(file);
    setFileMediaType(detectedType);
    setFilePreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
  };

  const clearSelectedFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setSelectedFile(null);
    setFileMediaType(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // In-memory caching for instant 0ms chat switching
  const messagesCacheRef = useRef<Map<string, MessageCacheEntry>>(new Map());

  // Request counter for stale response protection on rapid switching (A -> B -> C)
  const requestCounterRef = useRef<number>(0);

  // Tracking refs for realtime callbacks without hook teardown
  const selectedConvIdRef = useRef<string | null>(selectedConvId);
  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  const filtersRef = useRef({ channel: channelFilter, status: statusFilter, search: searchTerm });
  useEffect(() => {
    filtersRef.current = { channel: channelFilter, status: statusFilter, search: searchTerm };
  }, [channelFilter, statusFilter, searchTerm]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Link Customer state
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Simulate Inbound Message state
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);
  const [simChannel, setSimChannel] = useState<ChannelType>('whatsapp');
  const [simSender, setSimSender] = useState<string>('Ahmed Customer');
  const [simPhone, setSimPhone] = useState<string>('+201012345678');
  const [simContent, setSimContent] = useState<string>('Hello, I am inquiring about your services.');

  const isAdmin =
    user.permissions.includes('crm.inbox.read_all') || user.permissions.includes('admin.system');

  // Auto-scroll message list to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    isNearBottomRef.current = isNearBottom;
  };

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Refresh conversation list from server (only used for user-initiated filter changes or search)
  const refreshConversations = useCallback(async (autoSelectIfNone = false) => {
    try {
      const data = await getConversations({
        channel: filtersRef.current.channel,
        status: filtersRef.current.status,
        search: filtersRef.current.search,
      });

      setConversations(() => {
        return data.map((c) => {
          if (c.id === selectedConvIdRef.current) {
            return { ...c, unread_count: 0 };
          }
          return c;
        });
      });

      setSelectedConvId((currentSelected) => {
        if ((autoSelectIfNone || !currentSelected) && data.length > 0) {
          return currentSelected && data.some((c) => c.id === currentSelected)
            ? currentSelected
            : data[0].id;
        }
        if (currentSelected && !data.some((c) => c.id === currentSelected) && data.length > 0) {
          return data[0].id;
        }
        return currentSelected;
      });
    } catch (err) {
      console.error('[Inbox] Error refreshing conversations:', err);
    }
  }, []);

  // Filter & search changes trigger conversation refresh
  useEffect(() => {
    startTransition(() => {
      void refreshConversations(false);
    });
  }, [channelFilter, statusFilter, searchTerm, refreshConversations]);

  // Fast Instant Switching: Renders conversation metadata immediately + caches messages
  const handleSelectConversation = useCallback(
    (conv: ConversationWithDetails) => {
      const convId = conv.id;
      if (selectedConvIdRef.current === convId) return;

      // CRITICAL: Synchronously update ref & active state immediately (0ms UI transition)
      selectedConvIdRef.current = convId;
      setSelectedConvId(convId);
      setActiveConv({ ...conv, unread_count: 0 });

      // Reset unread count in conversation list state immediately
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );

      // Stale-response guard: increment request counter
      requestCounterRef.current += 1;
      const currentRequestId = requestCounterRef.current;

      // Dispatch mark as read on server in background (NON-BLOCKING)
      void markConversationAsRead(convId).catch((err) =>
        console.warn("[Inbox] markConversationAsRead error:", err)
      );

      // Read from Cache: Render cached messages IMMEDIATELY without blocking spinner!
      const cacheEntry = messagesCacheRef.current.get(convId);
      if (cacheEntry) {
        setMessages(cacheEntry.messages);
        setIsLoadingMessages(false);
      } else {
        // Cold cache / First open: show lightweight messages-area skeleton
        setMessages([]);
        setIsLoadingMessages(true);
      }

      // Background SWR fetch: fetch missing/newer messages safely
      const now = Date.now();
      const isRecentlyFetched = cacheEntry && now - cacheEntry.fetchedAt < 3000;

      if (!isRecentlyFetched) {
        void getMessages(convId)
          .then((serverMsgs) => {
            const isStillCurrent =
              selectedConvIdRef.current === convId &&
              currentRequestId === requestCounterRef.current;

            const existingCached = messagesCacheRef.current.get(convId)?.messages || [];
            const merged = mergeMessages(existingCached, serverMsgs);

            messagesCacheRef.current.set(convId, {
              messages: merged,
              fetchedAt: Date.now(),
              loading: false,
            });

            if (isStillCurrent) {
              setMessages(merged);
              setIsLoadingMessages(false);
            }
          })
          .catch((err) => {
            console.error("[Inbox] Error loading background messages:", err);
            if (
              selectedConvIdRef.current === convId &&
              currentRequestId === requestCounterRef.current
            ) {
              setIsLoadingMessages(false);
            }
          });
      }

      // Background enrich full conversation details (customer / lead details)
      void getConversationDetails(convId)
        .then((fullConv) => {
          if (fullConv && selectedConvIdRef.current === convId && currentRequestId === requestCounterRef.current) {
            setActiveConv((prev) => {
              if (!prev || prev.id !== convId) return prev;
              return {
                ...fullConv,
                unread_count: 0,
              };
            });
          }
        })
        .catch((err) => {
          console.warn("[Inbox] Error enriching conversation details:", err);
        });
    },
    []
  );

  // Initial load on mount: zero unread & fetch messages for first conversation
  useEffect(() => {
    if (!initialConversations[0]?.id) return;
    const initialConv = initialConversations[0];
    const initialId = initialConv.id;

    // Zero out unread count in DB & fetch initial messages
    void markConversationAsRead(initialId).catch((err) =>
      console.warn('[Inbox] Initial mark-as-read error:', err)
    );

    void getMessages(initialId)
      .then((freshMsgs) => {
        if (selectedConvIdRef.current === initialId) {
          setMessages(freshMsgs);
          messagesCacheRef.current.set(initialId, { messages: freshMsgs, fetchedAt: Date.now(), loading: false });
          setIsLoadingMessages(false);
        }
      })
      .catch((err) => {
        console.error('[Inbox] Error loading initial messages:', err);
      });

    // Background pre-load messages for top conversations to make subsequent clicks 0ms
    const topConvs = initialConversations.slice(1, 6);
    topConvs.forEach((c) => {
      void getMessages(c.id).then((msgs) => {
        messagesCacheRef.current.set(c.id, { messages: msgs, fetchedAt: Date.now(), loading: false });
      });
    });
  }, [initialConversations]);

  // Keep background cache warmed for active conversation list
  useEffect(() => {
    if (conversations.length === 0) return;
    conversations.slice(0, 50).forEach((c) => {
      if (!messagesCacheRef.current.has(c.id)) {
        void getMessages(c.id).then((msgs) => {
          messagesCacheRef.current.set(c.id, { messages: msgs || [], fetchedAt: Date.now(), loading: false });
        });
      }
    });
  }, [conversations]);

  // Supabase Realtime Subscription (Singleton across component lifetime)
  useEffect(() => {
    const supabase = createClient();

    // Authenticate realtime websocket connection with session JWT
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
    });

    const handleMessageEvent = (payload: { new?: unknown; old?: unknown; eventType?: string }) => {
      const newMsg = payload.new as Message | undefined;
      if (!newMsg || !newMsg.id) return;

      const currentOpenConvId = selectedConvIdRef.current;
      const isCurrentOpen = newMsg.conversation_id === currentOpenConvId;
      const mediaLabel =
        newMsg.message_type === 'image'
          ? '📷 Image'
          : newMsg.message_type === 'video'
          ? '🎥 Video'
          : newMsg.message_type === 'audio'
          ? '🎵 Audio'
          : newMsg.message_type === 'document'
          ? '📄 Document'
          : '[Media attachment]';
      const previewText = (newMsg.content || (newMsg.media_url ? mediaLabel : '')).slice(
        0,
        100
      );

      // 1. If message belongs to currently active thread:
      if (isCurrentOpen) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) =>
              m.id === newMsg.id ||
              (newMsg.external_message_id && m.external_message_id === newMsg.external_message_id)
          );
          const updated = exists
            ? prev.map((m) => {
                if (
                  m.id === newMsg.id ||
                  (newMsg.external_message_id && m.external_message_id === newMsg.external_message_id)
                ) {
                  const newHasHttp = newMsg.media_url && (newMsg.media_url.startsWith('http://') || newMsg.media_url.startsWith('https://'));
                  const localHasBlob = m.media_url && m.media_url.startsWith('blob:');
                  const finalMediaUrl = newHasHttp ? newMsg.media_url : (localHasBlob ? m.media_url : (newMsg.media_url || m.media_url));

                  const finalAttachments = (newMsg.attachments && newMsg.attachments.length > 0)
                    ? newMsg.attachments.map((na, idx) => ({
                        ...na,
                        signed_url: (na.signed_url && (na.signed_url.startsWith('http') || na.signed_url.startsWith('blob:')))
                          ? na.signed_url
                          : (m.attachments?.[idx]?.signed_url || m.attachments?.[0]?.signed_url || na.signed_url),
                      }))
                    : m.attachments;

                  return {
                    ...m,
                    ...newMsg,
                    media_url: finalMediaUrl,
                    attachments: finalAttachments,
                  };
                }
                return m;
              })
            : [...prev, newMsg];
          messagesCacheRef.current.set(newMsg.conversation_id, { messages: updated, fetchedAt: Date.now(), loading: false });
          return updated;
        });

        // Auto-scroll if user is near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 50);
        }

        // Auto-mark read on server if inbound
        if (newMsg.direction === 'inbound') {
          void markConversationAsRead(newMsg.conversation_id);
        }
      } else {
        // Update cached messages if previously loaded
        const cached = messagesCacheRef.current.get(newMsg.conversation_id);
        const existingMsgs = cached ? cached.messages : [];
        const next = mergeMessages(existingMsgs, [newMsg]);
        messagesCacheRef.current.set(newMsg.conversation_id, {
          messages: next,
          fetchedAt: Date.now(),
          loading: false,
        });
      }

      // 2. Update conversation list directly in local state WITHOUT delay
      setConversations((prev) => {
        const targetIdx = prev.findIndex((c) => c.id === newMsg.conversation_id);

        if (targetIdx === -1) {
          // Brand new conversation: create optimistic record to appear in 0ms!
          const optimisticConv: ConversationWithDetails = {
            id: newMsg.conversation_id,
            channel: 'whatsapp',
            external_thread_id: 'pending',
            channel_identity_id: 'pending',
            customer_id: null,
            lead_id: null,
            assigned_to: null,
            status: 'open',
            unread_count: isCurrentOpen ? 0 : 1,
            last_message_preview: previewText,
            last_message_at: newMsg.created_at || new Date().toISOString(),
            created_at: newMsg.created_at || new Date().toISOString(),
            updated_at: newMsg.created_at || new Date().toISOString(),
            channel_identity: {
              id: 'pending',
              channel: 'whatsapp',
              external_id: 'New Contact',
              display_name: 'New Contact',
              phone: null,
              email: null,
              avatar_url: null,
              customer_id: null,
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            customer: null,
            lead: null,
            assigned_to_employee: null,
          };

          // Fetch full conversation details in background and hydrate
          void getConversationDetails(newMsg.conversation_id).then((freshConv) => {
            if (freshConv) {
              setConversations((curr) => {
                const idx = curr.findIndex((c) => c.id === freshConv.id);
                if (idx === -1) return [freshConv, ...curr];
                return curr.map((c) =>
                  c.id === freshConv.id
                    ? {
                        ...freshConv,
                        unread_count: isCurrentOpen ? 0 : freshConv.unread_count || c.unread_count,
                        last_message_preview: previewText || freshConv.last_message_preview,
                        last_message_at: newMsg.created_at || freshConv.last_message_at,
                      }
                    : c
                );
              });
            }
          });

          return [optimisticConv, ...prev];
        }

        const existing = prev[targetIdx];
        const updatedConv: ConversationWithDetails = {
          ...existing,
          last_message_at: newMsg.created_at || new Date().toISOString(),
          last_message_preview: previewText,
          unread_count: isCurrentOpen
            ? 0
            : (existing.unread_count || 0) + (newMsg.direction === 'inbound' ? 1 : 0),
        };

        // Move updated conversation to top of list
        return [updatedConv, ...prev.slice(0, targetIdx), ...prev.slice(targetIdx + 1)];
      });
    };

    const handleConversationEvent = (payload: { new?: unknown; old?: unknown; eventType?: string }) => {
      const newConv = payload.new as ConversationWithDetails | undefined;
      if (!newConv || !newConv.id) return;

      const currentOpenConvId = selectedConvIdRef.current;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === newConv.id);
        if (idx === -1) {
          // Brand new conversation: fetch details and prepend immediately
          void getConversationDetails(newConv.id).then((freshConv) => {
            if (freshConv) {
              setConversations((curr) =>
                curr.some((c) => c.id === freshConv.id)
                  ? curr.map((c) => (c.id === freshConv.id ? { ...c, ...freshConv } : c))
                  : [freshConv, ...curr]
              );
            }
          });
          return prev;
        }

        const existing = prev[idx];
        // SAFELY MERGE without overwriting joined relation objects (channel_identity, customer, lead, assigned_to_employee)!
        const merged: ConversationWithDetails = {
          ...existing,
          ...newConv,
          channel_identity: existing.channel_identity,
          customer: existing.customer,
          lead: existing.lead,
          assigned_to_employee: existing.assigned_to_employee,
          last_message_at: newConv.last_message_at || existing.last_message_at,
          last_message_preview: newConv.last_message_preview || existing.last_message_preview,
          unread_count:
            existing.id === currentOpenConvId
              ? 0
              : (newConv.unread_count ?? existing.unread_count),
        };

        return [merged, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });

      if (newConv.id === currentOpenConvId) {
        setActiveConv((prev) => {
          if (!prev || prev.id !== newConv.id) return prev;
          return {
            ...prev,
            ...newConv,
            channel_identity: prev.channel_identity,
            customer: prev.customer,
            lead: prev.lead,
            assigned_to_employee: prev.assigned_to_employee,
            unread_count: 0,
          };
        });
      }
    };

    const handleAttachmentEvent = async (payload: { new?: unknown; old?: unknown; eventType?: string }) => {
      const newAtt = payload.new as MessageAttachment | undefined;
      if (!newAtt || !newAtt.message_id) return;

      let signedUrl = newAtt.signed_url;
      if (!signedUrl && newAtt.storage_path) {
        const signedRes = await getMediaSignedUrl(newAtt.storage_path);
        if (signedRes.success && signedRes.data) {
          signedUrl = signedRes.data.signedUrl;
        }
      }

      const enrichedAtt: MessageAttachment = { ...newAtt, signed_url: signedUrl };

      setMessages((prev) => {
        const msgIdx = prev.findIndex((m) => m.id === newAtt.message_id);
        if (msgIdx === -1) return prev;

        const targetMsg = prev[msgIdx];
        const existingAtts = targetMsg.attachments || [];
        const attIdx = existingAtts.findIndex((a) => a.id === newAtt.id || a.id.startsWith('temp_att_'));

        let nextAtts: MessageAttachment[];
        if (attIdx === -1) {
          nextAtts = [...existingAtts, enrichedAtt];
        } else {
          nextAtts = existingAtts.map((a, idx) => (idx === attIdx ? enrichedAtt : a));
        }

        const updatedMsg: Message = {
          ...targetMsg,
          media_url: signedUrl || targetMsg.media_url,
          attachments: nextAtts,
        };

        const next = [...prev.slice(0, msgIdx), updatedMsg, ...prev.slice(msgIdx + 1)];
        const activeId = selectedConvIdRef.current;
        if (activeId) {
          messagesCacheRef.current.set(activeId, { messages: next, fetchedAt: Date.now(), loading: false });
        }
        return next;
      });
    };

    const channel = supabase
      .channel('inbox-realtime-master')
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'messages' },
        handleMessageEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'conversations' },
        handleConversationEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'message_attachments' },
        handleAttachmentEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        handleMessageEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        handleConversationEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_attachments' },
        handleAttachmentEvent
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Inbox Realtime] Subscribed to realtime updates');
        }
      });

    // Fail-safe live background sync for open conversation and conversation list (every 3 seconds)
    const syncInterval = setInterval(() => {
      const activeId = selectedConvIdRef.current;
      if (activeId) {
        void getMessages(activeId).then((freshMsgs) => {
          if (selectedConvIdRef.current === activeId && Array.isArray(freshMsgs)) {
            setMessages((prev) => {
              // 1. Collect all local in-flight messages (sending, temp)
              const inFlight = prev.filter((p) => p.status === 'sending' || p.id.startsWith('temp_'));
              const freshIdSet = new Set(freshMsgs.map((m) => m.id));

              // 2. Map fresh messages, preserving local previews if fresh message doesn't have a valid HTTP signed URL yet
              const merged: Message[] = freshMsgs.map((fm) => {
                const local = prev.find((p) => p.id === fm.id);
                if (!local) return fm;

                const localMedia = local.media_url || local.attachments?.[0]?.signed_url;
                const serverMedia = fm.media_url || fm.attachments?.[0]?.signed_url;

                const serverHasHttp = serverMedia && (serverMedia.startsWith('http://') || serverMedia.startsWith('https://'));
                const localHasBlob = localMedia && localMedia.startsWith('blob:');

                const preferredMediaUrl = serverHasHttp ? fm.media_url : (localHasBlob ? local.media_url : fm.media_url);

                const mergedAtts = (fm.attachments && fm.attachments.length > 0)
                  ? fm.attachments.map((fa, idx) => ({
                      ...fa,
                      signed_url: (fa.signed_url?.startsWith('http') ? fa.signed_url : null) || local.attachments?.[idx]?.signed_url || local.attachments?.[0]?.signed_url || fa.signed_url,
                    }))
                  : (local.attachments || []);

                return {
                  ...fm,
                  media_url: preferredMediaUrl,
                  attachments: mergedAtts,
                };
              });

              // 3. CRITICAL: Re-add any in-flight messages that are still uploading and not yet in freshMsgs!
              for (const pending of inFlight) {
                if (!freshIdSet.has(pending.id)) {
                  merged.push(pending);
                }
              }

              // Sort chronologically
              merged.sort((a, b) => new Date(a.created_at || a.sent_at || 0).getTime() - new Date(b.created_at || b.sent_at || 0).getTime());

              const isDifferent =
                merged.length !== prev.length ||
                merged.some((m, idx) => {
                  const p = prev[idx];
                  return !p || p.id !== m.id || p.status !== m.status || p.media_url !== m.media_url;
                });

              if (isDifferent) {
                messagesCacheRef.current.set(activeId, { messages: merged, fetchedAt: Date.now(), loading: false });
                if (isNearBottomRef.current) {
                  setTimeout(() => scrollToBottom(true), 50);
                }
                return merged;
              }
              return prev;
            });
          }
        });
      }

      // Background sync conversations list
      void getConversations({
        channel: filtersRef.current.channel,
        status: filtersRef.current.status,
        search: filtersRef.current.search,
      })
        .then((serverConvs) => {
          if (serverConvs) {
            setConversations((prev) => {
              const prevMap = new Map(prev.map((c) => [c.id, c]));
              const currOpen = selectedConvIdRef.current;

              const merged = serverConvs.map((sc) => {
                const existing = prevMap.get(sc.id);
                const isLocallyNewer =
                  existing?.last_message_at &&
                  new Date(existing.last_message_at).getTime() >
                    new Date(sc.last_message_at).getTime();

                return {
                  ...sc,
                  unread_count: sc.id === currOpen ? 0 : sc.unread_count,
                  last_message_at: isLocallyNewer
                    ? existing!.last_message_at
                    : sc.last_message_at,
                  last_message_preview: isLocallyNewer
                    ? existing!.last_message_preview
                    : sc.last_message_preview,
                };
              });

              for (const p of prev) {
                if (!serverConvs.some((sc) => sc.id === p.id)) {
                  merged.push(p);
                }
              }

              if (
                merged.length !== prev.length ||
                merged.some((m, idx) => {
                  const p = prev[idx];
                  return (
                    !p ||
                    p.id !== m.id ||
                    p.last_message_at !== m.last_message_at ||
                    p.unread_count !== m.unread_count ||
                    p.last_message_preview !== m.last_message_preview
                  );
                })
              ) {
                return merged;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(syncInterval);
      void supabase.removeChannel(channel);
    };
  }, [scrollToBottom]);

  // Outbound Message Dispatcher (Non-blocking background sync)
  const dispatchOutboundMessage = useCallback(
    async (convId: string, content: string, tempId: string) => {
      const res = await sendOutboundReply({
        id: tempId,
        conversation_id: convId,
        content,
      });

      if (res.success && res.data) {
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  ...res.data!,
                  status: res.data!.status || 'sent',
                }
              : m
          );
          messagesCacheRef.current.set(convId, { messages: next, fetchedAt: Date.now(), loading: false });
          return next;
        });
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
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  status: 'failed' as const,
                  error_detail: res.error || 'Failed to deliver message to customer',
                }
              : m
          );
          messagesCacheRef.current.set(convId, { messages: next, fetchedAt: Date.now(), loading: false });
          return next;
        });
      }
    },
    []
  );

  // Send reply handler (Optimistic UI - 0ms response)
  const handleSendReply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = replyText.trim();
    if (!selectedConvId || activeConv?.status === 'closed') return;
    if (!content && !selectedFile) return;

    const fileToSend = selectedFile;
    const fileTypeToSend = fileMediaType;
    const fileUrlToSend = filePreviewUrl;

    // Reset composer state immediately for instant responsiveness
    setReplyText('');
    setSelectedFile(null);
    setFileMediaType(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setErrorMsg(null);

    const tempId = crypto.randomUUID();

    if (fileToSend) {
      // ─── OUTBOUND MEDIA FLOW ───
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: selectedConvId,
        direction: 'outbound',
        sender_type: 'employee',
        sender_employee_id: user.employee?.id || null,
        content: content || fileToSend.name,
        media_url: fileUrlToSend,
        message_type: fileTypeToSend || 'image',
        status: 'sending',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        error_detail: null,
        raw_event_id: null,
        external_message_id: null,
        attachments: [
          {
            id: `temp_att_${Date.now()}`,
            message_id: tempId,
            storage_path: 'pending',
            provider: activeConv?.channel || 'whatsapp',
            external_media_id: null,
            media_type: fileTypeToSend || 'image',
            mime_type: fileToSend.type,
            file_name: fileToSend.name,
            file_size: fileToSend.size,
            width: null,
            height: null,
            duration_ms: null,
            caption: content || null,
            checksum: null,
            status: 'pending',
            metadata: {},
            created_at: new Date().toISOString(),
            signed_url: fileUrlToSend,
          },
        ],
      };

      // 1. Instant optimistic state update
      setMessages((prev) => {
        const next = [...prev, optimisticMsg];
        messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
        return next;
      });
      setTimeout(() => scrollToBottom(true), 50);

      const previewLabel =
        fileTypeToSend === 'image'
          ? '📷 Image'
          : fileTypeToSend === 'video'
          ? '🎥 Video'
          : fileTypeToSend === 'audio'
          ? '🎵 Audio'
          : '📄 Document';
      const previewText = content || previewLabel;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedConvId);
        if (idx === -1) return prev;
        const updated: ConversationWithDetails = {
          ...prev[idx],
          last_message_at: optimisticMsg.created_at,
          last_message_preview: previewText.slice(0, 100),
        };
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });

      setActiveConv((prev) =>
        prev && prev.id === selectedConvId
          ? {
              ...prev,
              last_message_at: optimisticMsg.created_at,
              last_message_preview: previewText.slice(0, 100),
            }
          : prev
      );

      // 2. Dispatch Direct-to-Storage upload & send action
      void (async () => {
        try {
          // Client-side image downscaling for photos > 2MB (preserve docs/audio/video)
          let finalFile = fileToSend;
          if (fileToSend.type.startsWith('image/') && fileToSend.type !== 'image/gif' && fileToSend.size > 2 * 1024 * 1024) {
            try {
              const img = new Image();
              const objectUrl = URL.createObjectURL(fileToSend);
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
                img.src = objectUrl;
              });
              URL.revokeObjectURL(objectUrl);
              const maxDim = 1600;
              let { width, height } = img;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
                if (blob && blob.size < fileToSend.size) {
                  finalFile = new File([blob], fileToSend.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' });
                }
              }
            } catch (compressErr) {
              console.warn('[Direct Media] Downscale fallback:', compressErr);
            }
          }

          // A. Request short-lived signed upload URL (bypasses 4.5MB Vercel limit)
          const urlRes = await createMediaUploadUrl({
            conversationId: selectedConvId,
            fileName: finalFile.name,
            fileType: finalFile.type,
            fileSize: finalFile.size,
          });

          if (!urlRes.success || !urlRes.data) {
            throw new Error(urlRes.error || 'Failed to initialize direct storage upload');
          }

          const { uploadUrl, storagePath } = urlRes.data;

          // B. Direct upload to Supabase Storage bucket via PUT
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: finalFile,
            headers: {
              'Content-Type': finalFile.type || 'application/octet-stream',
            },
          });

          if (!uploadRes.ok) {
            throw new Error(`Direct storage upload failed with status ${uploadRes.status}`);
          }

          // C. Finalize upload & dispatch to Meta
          const finalizeRes = await finalizeOutboundMediaReply({
            conversationId: selectedConvId,
            msgId: tempId,
            storagePath,
            fileName: finalFile.name,
            fileType: finalFile.type,
            caption: content || undefined,
          });

          if (finalizeRes.success && finalizeRes.data) {
            setMessages((prev) => {
              const next = prev.map((m) => {
                if (m.id === tempId) {
                  const serverAtts = finalizeRes.data!.attachments || [];
                  const mergedAtts = serverAtts.length > 0
                    ? serverAtts.map((sa) => ({
                        ...sa,
                        status: 'stored' as const,
                        signed_url: sa.signed_url || fileUrlToSend || m.media_url || undefined,
                      }))
                    : (m.attachments || []).map((ma) => ({
                        ...ma,
                        status: 'stored' as const,
                        signed_url: ma.signed_url || fileUrlToSend || undefined,
                      }));

                  return {
                    ...m,
                    ...finalizeRes.data!,
                    status: finalizeRes.data!.status || 'sent',
                    media_url: finalizeRes.data!.media_url || fileUrlToSend || m.media_url,
                    attachments: mergedAtts,
                  };
                }
                return m;
              });
              if (!next.some((m) => m.id === tempId || m.id === finalizeRes.data!.id)) {
                next.push({
                  ...finalizeRes.data!,
                  status: finalizeRes.data!.status || 'sent',
                  media_url: finalizeRes.data!.media_url || fileUrlToSend || null,
                });
              }
              messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
              return next;
            });
          } else {
            throw new Error(finalizeRes.error || 'Failed to finalize media dispatch');
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Media upload failed';
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    status: 'failed' as const,
                    error_detail: errorMsg,
                  }
                : m
            );
            messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
            return next;
          });
        }
      })();
      return;
    }

    // ─── OUTBOUND TEXT FLOW ───
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

    // 1. Instant optimistic state update
    setMessages((prev) => {
      const next = [...prev, optimisticMsg];
      messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
      return next;
    });
    setErrorMsg(null);
    setTimeout(() => scrollToBottom(true), 50);

    // Update conversation list preview & timestamp immediately and move to top
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === selectedConvId);
      if (idx === -1) return prev;
      const updated: ConversationWithDetails = {
        ...prev[idx],
        last_message_at: optimisticMsg.created_at,
        last_message_preview: content.slice(0, 100),
      };
      return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });

    setActiveConv((prev) =>
      prev && prev.id === selectedConvId
        ? {
            ...prev,
            last_message_at: optimisticMsg.created_at,
            last_message_preview: content.slice(0, 100),
          }
        : prev
    );

    // 2. Dispatch background server action
    void dispatchOutboundMessage(selectedConvId, content, tempId);
  };

  // Retry failed message
  const handleRetryMessage = async (msgToRetry: Message) => {
    if (!selectedConvId || msgToRetry.direction !== 'outbound') return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgToRetry.id ? { ...m, status: 'sending', error_detail: null } : m
      )
    );

    if (msgToRetry.attachments && msgToRetry.attachments.length > 0) {
      const res = await retryOutboundMediaReply(msgToRetry.id);
      if (res.success && res.data) {
        setMessages((prev) => {
          const next = prev.map((m) => (m.id === msgToRetry.id ? res.data! : m));
          messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
          return next;
        });
      } else {
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === msgToRetry.id
              ? { ...m, status: 'failed' as const, error_detail: res.error || 'Retry failed' }
              : m
          );
          messagesCacheRef.current.set(selectedConvId, { messages: next, fetchedAt: Date.now(), loading: false });
          return next;
        });
      }
    } else if (msgToRetry.content) {
      void dispatchOutboundMessage(selectedConvId, msgToRetry.content, msgToRetry.id);
    }
  };

  // Status Change
  const handleStatusChange = async (newStatus: ConversationStatus) => {
    if (!selectedConvId) return;
    const res = await updateConversationStatus({
      conversation_id: selectedConvId,
      status: newStatus,
    });
    if (res.success) {
      setActiveConv((prev) => (prev ? { ...prev, status: newStatus } : null));
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConvId ? { ...c, status: newStatus } : c))
      );
    } else {
      setErrorMsg(res.error || 'Failed to update status');
    }
  };

  // Link Customer
  const handleLinkCustomer = async () => {
    if (!selectedConvId || !selectedCustomerId) return;
    const res = await linkConversationCustomer({
      conversation_id: selectedConvId,
      customer_id: selectedCustomerId,
    });

    if (res.success) {
      setShowLinkModal(false);
      const updated = await getConversationDetails(selectedConvId);
      if (updated) {
        setActiveConv(updated);
      }
      void refreshConversations();
    } else {
      setErrorMsg(res.error || 'Failed to link customer');
    }
  };

  // Simulate Inbound Message
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
      if (res.data?.conversation_id) {
        const convId = res.data.conversation_id;
        setSelectedConvId(convId);
        void refreshConversations(false);
      }
    } else {
      setErrorMsg(res.error || 'Simulation failed');
    }
  };

  // Group messages by date for date separators
  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; msgs: Message[] }[] = [];
    let currentLabel = '';
    let currentBatch: Message[] = [];

    messages.forEach((msg) => {
      const label = formatDateSeparator(msg.created_at || msg.received_at);
      if (label !== currentLabel) {
        if (currentBatch.length > 0) {
          groups.push({ dateLabel: currentLabel, msgs: currentBatch });
        }
        currentLabel = label;
        currentBatch = [msg];
      } else {
        currentBatch.push(msg);
      }
    });

    if (currentBatch.length > 0) {
      groups.push({ dateLabel: currentLabel, msgs: currentBatch });
    }

    return groups;
  }, [messages]);

  // Total unread count across visible conversations
  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }, [conversations]);

  // WhatsApp-like sorting: Most recently active chat always on top (by last_message_at DESC)
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime() || 0;
      const timeB = new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime() || 0;
      return timeB - timeA;
    });
  }, [conversations]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 72px)',
        background: '#0B0F19',
        color: '#F8FAFC',
        fontFamily: 'inherit',
      }}
    >
      {/* ─── Top Header & Controls ──────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          background: '#111827',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: '56px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #0284C7, #0369A1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
            }}
          >
            <MessageSquare size={18} style={{ color: '#FFF' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                Unified Inbox
              </h1>
              {totalUnreadCount > 0 && (
                <span
                  style={{
                    background: '#0284C7',
                    color: '#FFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  {totalUnreadCount} unread
                </span>
              )}
            </div>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>
              WhatsApp, Instagram & Facebook Messenger
            </span>
          </div>
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
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={14} /> Simulate Inbound Message
          </button>
          <button
            onClick={() => void refreshConversations(false)}
            disabled={isPending}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#CBD5E1',
              padding: '7px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
            }}
            title="Refresh Conversations"
          >
            <RefreshCw
              size={13}
              style={{ animation: isPending ? 'spin 1s linear infinite' : 'none' }}
            />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Error notification bar */}
      {errorMsg && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            borderLeft: '4px solid #EF4444',
            color: '#FCA5A5',
            padding: '8px 16px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── 3-Pane Responsive Layout ───────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ═══════════════════════════════════════════════════════════
            PANE 1: Conversation List (Left, 340px)
        ═══════════════════════════════════════════════════════════ */}
        <aside
          style={{
            width: '340px',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            background: '#0F172A',
            flexShrink: 0,
          }}
        >
          {/* Search & Filters */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: '#0F172A',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '10px',
                  color: '#64748B',
                }}
              />
              <input
                type="text"
                placeholder="Search name, phone, or message..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '7px 10px 7px 32px',
                  color: '#F8FAFC',
                  fontSize: '12px',
                  outline: 'none',
                  transition: 'border 0.15s ease',
                }}
              />
            </div>

            {/* Channel Pills */}
            <div
              style={{
                display: 'flex',
                gap: '5px',
                overflowX: 'auto',
                paddingBottom: '4px',
                marginBottom: '8px',
                scrollbarWidth: 'none',
              }}
            >
              {['all', 'whatsapp', 'instagram', 'messenger'].map((ch) => {
                const isSelected = channelFilter === ch;
                const theme = CHANNEL_THEMES[ch] || CHANNEL_THEMES.other;
                return (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    style={{
                      background: isSelected ? theme.bg : 'rgba(255,255,255,0.03)',
                      color: isSelected ? theme.text : '#94A3B8',
                      border: isSelected
                        ? `1px solid ${theme.border}`
                        : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '16px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {ch === 'all' ? 'All Channels' : theme.name}
                  </button>
                );
              })}
            </div>

            {/* Status Filter */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'rgba(255,255,255,0.03)',
                padding: '2px',
                borderRadius: '6px',
              }}
            >
              {['all', 'open', 'closed', ...(isAdmin ? ['pending_assignment'] : [])].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    flex: 1,
                    background: statusFilter === st ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: statusFilter === st ? '#F8FAFC' : '#64748B',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: statusFilter === st ? 600 : 400,
                    textTransform: 'capitalize',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {st === 'pending_assignment' ? 'Pending' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Cards List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {sortedConversations.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#64748B',
                  fontSize: '13px',
                }}
              >
                <MessageSquare size={32} style={{ opacity: 0.2, margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No conversations found</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                  Inbound messages will appear here automatically.
                </p>
              </div>
            ) : (
              sortedConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const theme = CHANNEL_THEMES[conv.channel] || CHANNEL_THEMES.other;
                const displayName = resolveDisplayName(conv);
                const initials = getInitials(displayName);
                const hasUnread = (conv.unread_count || 0) > 0 && !isSelected;

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: isSelected
                        ? 'rgba(2, 132, 199, 0.14)'
                        : hasUnread
                        ? 'rgba(255,255,255,0.03)'
                        : 'transparent',
                      border: isSelected
                        ? '1px solid rgba(2, 132, 199, 0.35)'
                        : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease',
                      position: 'relative',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    {/* Contact Avatar with Channel Badge */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: isSelected
                            ? 'linear-gradient(135deg, #0284C7, #0369A1)'
                            : 'linear-gradient(135deg, #1E293B, #334155)',
                          color: '#FFF',
                          fontWeight: 700,
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid rgba(255,255,255,0.1)',
                          overflow: 'hidden',
                        }}
                      >
                        {conv.channel_identity?.avatar_url ? (
                          <img
                            src={conv.channel_identity.avatar_url}
                            alt={displayName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      {/* Channel Badge Overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: theme.badgeBg,
                          border: '2px solid #0F172A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={theme.name}
                      />
                    </div>

                    {/* Middle Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginBottom: '2px',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: hasUnread ? 700 : isSelected ? 600 : 500,
                            fontSize: '13px',
                            color: isSelected ? '#38BDF8' : '#F8FAFC',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {displayName}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B', flexShrink: 0 }}>
                          {formatMessageTime(conv.last_message_at)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: '11px',
                            color: hasUnread ? '#E2E8F0' : '#94A3B8',
                            fontWeight: hasUnread ? 600 : 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conv.last_message_preview || 'No messages yet'}
                        </p>
                        {hasUnread && (
                          <span
                            style={{
                              background: '#0284C7',
                              color: '#FFF',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              flexShrink: 0,
                              boxShadow: '0 1px 4px rgba(2, 132, 199, 0.4)',
                            }}
                          >
                            {conv.unread_count}
                          </span>
                        )}
                      </div>

                      {/* Rep & Status Tag */}
                      <div
                        style={{
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px',
                          color: '#64748B',
                        }}
                      >
                        <span>
                          {conv.assigned_to_employee?.full_name ||
                            (conv.status === 'pending_assignment' ? 'Pending Routing' : 'Unassigned')}
                        </span>
                        {conv.status === 'closed' && (
                          <span
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              color: '#94A3B8',
                              padding: '0 4px',
                              borderRadius: '3px',
                              fontSize: '9px',
                            }}
                          >
                            Closed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════════
            PANE 2: Message Thread & Composer (Center, Flex 1)
        ═══════════════════════════════════════════════════════════ */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#0B0F19',
            minWidth: 0,
          }}
        >
          {activeConv ? (
            <>
              {/* Thread Header */}
              <div
                style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  background: '#111827',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: '56px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #1E293B, #334155)',
                      color: '#FFF',
                      fontWeight: 700,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(255,255,255,0.1)',
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(resolveDisplayName(activeConv))}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          margin: 0,
                          color: '#F8FAFC',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {resolveDisplayName(activeConv)}
                      </h2>
                      <span
                        style={{
                          background:
                            (CHANNEL_THEMES[activeConv.channel] || CHANNEL_THEMES.other).bg,
                          color: (CHANNEL_THEMES[activeConv.channel] || CHANNEL_THEMES.other).text,
                          border: `1px solid ${
                            (CHANNEL_THEMES[activeConv.channel] || CHANNEL_THEMES.other).border
                          }`,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {activeConv.channel}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '2px',
                        fontSize: '11px',
                        color: '#94A3B8',
                      }}
                    >
                      <span>
                        Rep:{' '}
                        <strong style={{ color: '#CBD5E1' }}>
                          {activeConv.assigned_to_employee?.full_name ||
                            (activeConv.status === 'pending_assignment'
                              ? 'Pending Routing'
                              : 'Unassigned')}
                        </strong>
                      </span>
                      {activeConv.channel_identity?.phone && (
                        <span>
                          Phone:{' '}
                          <strong style={{ color: '#CBD5E1' }}>
                            {activeConv.channel_identity.phone}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right controls: Status selector & Sidebar toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={activeConv.status}
                    onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#F8FAFC',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {activeConv.status === 'pending_assignment' && (
                      <option value="pending_assignment">Pending Routing</option>
                    )}
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>

                  <button
                    onClick={() => setShowRightSidebar((prev) => !prev)}
                    style={{
                      background: showRightSidebar ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#CBD5E1',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showRightSidebar ? 'Hide Details' : 'Show Details'}
                  >
                    <Layers size={14} />
                  </button>
                </div>
              </div>

              {/* Message History */}
              <div
                onScroll={handleMessagesScroll}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {isLoadingMessages && messages.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px 4px" }}>
                    {/* Inbound Skeleton Bubble */}
                    <div style={{ display: "flex", gap: "10px", maxWidth: "60%" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ height: "10px", width: "70px", borderRadius: "4px", background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s ease-in-out infinite" }} />
                        <div style={{ height: "40px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s ease-in-out infinite" }} />
                      </div>
                    </div>
                    {/* Outbound Skeleton Bubble */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", alignSelf: "flex-end", width: "55%" }}>
                      <div style={{ height: "10px", width: "40px", borderRadius: "4px", background: "rgba(56,189,248,0.15)", animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ height: "36px", width: "100%", borderRadius: "12px", background: "rgba(56,189,248,0.15)", animation: "pulse 1.5s ease-in-out infinite" }} />
                    </div>
                    {/* Inbound Skeleton Bubble 2 */}
                    <div style={{ display: "flex", gap: "10px", maxWidth: "65%" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ height: "48px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s ease-in-out infinite" }} />
                      </div>
                    </div>
                  </div>
                ) : groupedMessages.length === 0 ? (
                  <div
                    style={{
                      margin: 'auto',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '13px',
                    }}
                  >
                    <MessageSquare size={36} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No messages in this conversation yet</p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569' }}>
                      Send an outbound message below to start chatting.
                    </p>
                  </div>
                ) : (
                  groupedMessages.map((group) => (
                    <React.Fragment key={group.dateLabel}>
                      {/* Date Separator Chip */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '10px 0',
                        }}
                      >
                        <span
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            color: '#94A3B8',
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '3px 12px',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          {group.dateLabel}
                        </span>
                      </div>

                      {/* Messages within this date group */}
                      {group.msgs.map((msg) => {
                        const isOutbound = msg.direction === 'outbound';

                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: isOutbound ? 'flex-end' : 'flex-start',
                              maxWidth: '100%',
                            }}
                          >
                            {/* Sender Name Label */}
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: isOutbound ? '#38BDF8' : '#94A3B8',
                                marginBottom: '2px',
                                paddingLeft: isOutbound ? 0 : '4px',
                                paddingRight: isOutbound ? '4px' : 0,
                              }}
                            >
                              {isOutbound ? 'You' : resolveDisplayName(activeConv)}
                            </span>

                            {/* Message Bubble */}
                            <div
                              style={{
                                maxWidth: '72%',
                                padding: '10px 14px',
                                borderRadius: isOutbound
                                  ? '16px 16px 2px 16px'
                                  : '16px 16px 16px 2px',
                                background: isOutbound
                                  ? msg.status === 'failed'
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : 'linear-gradient(135deg, #0284C7, #0369A1)'
                                  : '#1E293B',
                                color: '#F8FAFC',
                                fontSize: '13px',
                                lineHeight: 1.5,
                                border: isOutbound
                                  ? msg.status === 'failed'
                                    ? '1px solid #EF4444'
                                    : 'none'
                                  : '1px solid rgba(255,255,255,0.06)',
                                boxShadow: isOutbound
                                  ? '0 2px 8px rgba(2, 132, 199, 0.25)'
                                  : '0 2px 6px rgba(0,0,0,0.2)',
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {/* Phase 4E: Render attachments or legacy media */}
                              {msg.attachments && msg.attachments.length > 0 ? (
                                msg.attachments.map((att) => {
                                  if (att.status === 'failed') {
                                    return (
                                      <div
                                        key={att.id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '8px 10px',
                                          background: 'rgba(239, 68, 68, 0.2)',
                                          border: '1px solid rgba(239, 68, 68, 0.4)',
                                          borderRadius: '8px',
                                          color: '#FCA5A5',
                                          fontSize: '11px',
                                          marginBottom: msg.content ? '6px' : 0,
                                        }}
                                      >
                                        <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                                        <span>Media unavailable / download failed</span>
                                      </div>
                                    );
                                  }

                                  const rawSrc = att.signed_url || msg.media_url;
                                  const mediaSrc = (rawSrc && (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('blob:') || rawSrc.startsWith('data:'))) ? rawSrc : null;
                                  const isPendingMedia = msg.status === 'sending';

                                  if (att.media_type === 'image') {
                                    return (
                                      <div key={att.id} style={{ marginBottom: (msg.content || att.caption) ? '6px' : 0, position: 'relative' }}>
                                        <div
                                          onClick={() => mediaSrc && setPreviewModalAttachment({ url: mediaSrc, title: att.file_name || 'Image', type: 'image' })}
                                          style={{
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            maxWidth: '300px',
                                            maxHeight: '260px',
                                            background: '#0F172A',
                                            position: 'relative',
                                          }}
                                          title="Click to view full image"
                                        >
                                          {mediaSrc ? (
                                            <img
                                              src={mediaSrc}
                                              alt={att.file_name || 'Attachment'}
                                              loading="lazy"
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                maxHeight: '260px',
                                                objectFit: 'cover',
                                                borderRadius: '8px',
                                                opacity: isPendingMedia ? 0.85 : 1,
                                                transition: 'opacity 0.2s ease',
                                              }}
                                            />
                                          ) : (
                                            <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '11px' }}>
                                              Loading image...
                                            </div>
                                          )}

                                          {isPendingMedia && (
                                            <div
                                              style={{
                                                position: "absolute",
                                                top: "8px",
                                                right: "8px",
                                                background: "rgba(15, 23, 42, 0.85)",
                                                backdropFilter: "blur(4px)",
                                                padding: "4px 8px",
                                                borderRadius: "12px",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "5px",
                                                color: "#38BDF8",
                                                fontSize: "10px",
                                                fontWeight: 600,
                                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                                boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                                                zIndex: 2,
                                              }}
                                            >
                                              <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} />
                                              <span>Sending...</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (att.media_type === 'video') {
                                    return (
                                      <div key={att.id} style={{ marginBottom: (msg.content || att.caption) ? '6px' : 0, maxWidth: '320px' }}>
                                        {mediaSrc ? (
                                          <video
                                            src={mediaSrc}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            style={{
                                              width: '100%',
                                              maxHeight: '260px',
                                              borderRadius: '8px',
                                              background: '#000',
                                            }}
                                          />
                                        ) : (
                                          <div style={{ padding: '16px', background: '#0F172A', borderRadius: '8px', color: '#94A3B8', fontSize: '11px' }}>
                                            Video preview unavailable
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  if (att.media_type === 'audio') {
                                    return (
                                      <div key={att.id} style={{ marginBottom: (msg.content || att.caption) ? '6px' : 0, minWidth: '220px', maxWidth: '320px' }}>
                                        {mediaSrc ? (
                                          <audio
                                            src={mediaSrc}
                                            controls
                                            preload="none"
                                            style={{ width: '100%', height: '36px' }}
                                          />
                                        ) : (
                                          <div style={{ padding: '10px', color: '#94A3B8', fontSize: '11px' }}>
                                            Audio preview unavailable
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  // Document attachment
                                  return (
                                    <div
                                      key={att.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        marginBottom: (msg.content || att.caption) ? '6px' : 0,
                                        minWidth: '220px',
                                        maxWidth: '320px',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <FileText size={20} style={{ color: '#38BDF8', flexShrink: 0 }} />
                                        <div style={{ overflow: 'hidden' }}>
                                          <div
                                            style={{
                                              fontSize: '12px',
                                              fontWeight: 600,
                                              color: '#F8FAFC',
                                              textOverflow: 'ellipsis',
                                              overflow: 'hidden',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {att.file_name || 'Document'}
                                          </div>
                                          {att.file_size ? (
                                            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                              {formatFileSize(att.file_size)}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                      {mediaSrc && (
                                        <a
                                          href={safeMediaUrl(mediaSrc)}
                                          download={att.file_name || 'document'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '6px',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: '#F8FAFC',
                                            textDecoration: 'none',
                                            flexShrink: 0,
                                          }}
                                          title="Download document"
                                        >
                                          <Download size={14} />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })
                              ) : msg.media_url || ['image', 'audio', 'video', 'document'].includes(msg.message_type) ? (
                                <div style={{ marginBottom: msg.content ? '8px' : 0 }}>
                                  {msg.message_type === 'audio' || (msg.media_url && (msg.media_url.includes('.ogg') || msg.media_url.includes('.mp3') || msg.media_url.includes('audio'))) ? (
                                    <div style={{ minWidth: '220px', maxWidth: '320px' }}>
                                      <audio
                                        src={msg.media_url || undefined}
                                        controls
                                        preload="none"
                                        style={{ width: '100%', height: '36px' }}
                                      />
                                    </div>
                                  ) : msg.message_type === 'video' || (msg.media_url && (msg.media_url.includes('.mp4') || msg.media_url.includes('video'))) ? (
                                    <div style={{ maxWidth: '320px' }}>
                                      <video
                                        src={msg.media_url || undefined}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        style={{ width: '100%', maxHeight: '260px', borderRadius: '8px', background: '#000' }}
                                      />
                                    </div>
                                  ) : msg.message_type === 'document' ? (
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        minWidth: '220px',
                                        maxWidth: '320px',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        <FileText size={20} style={{ color: '#38BDF8', flexShrink: 0 }} />
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>
                                          Document Attachment
                                        </span>
                                      </div>
                                      {msg.media_url && (
                                        <a
                                          href={safeMediaUrl(msg.media_url)}
                                          download="document"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '6px',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: '#F8FAFC',
                                            textDecoration: 'none',
                                            flexShrink: 0,
                                          }}
                                          title="Download document"
                                        >
                                          <Download size={14} />
                                        </a>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => msg.media_url && setPreviewModalAttachment({ url: msg.media_url, title: 'Image', type: 'image' })}
                                      style={{
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        maxWidth: '300px',
                                        maxHeight: '260px',
                                        background: '#0F172A',
                                      }}
                                      title="Click to view full image"
                                    >
                                      {msg.media_url ? (
                                        <img
                                          src={msg.media_url}
                                          alt="Media Attachment"
                                          loading="lazy"
                                          style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px' }}
                                        />
                                      ) : (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '11px' }}>
                                          Image Attachment
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              {/* Text content / caption */}
                              {msg.content && <div>{msg.content}</div>}
                            </div>

                            {/* Timestamp & Status Icon */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                marginTop: '3px',
                                fontSize: '10px',
                                color: '#64748B',
                              }}
                            >
                              <span>{formatMessageTime(msg.created_at || msg.received_at)}</span>
                              {isOutbound && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  {msg.status === 'sending' ? (
                                    <Clock
                                      size={11}
                                      style={{ color: '#94A3B8', animation: 'pulse 1s infinite' }}
                                    />
                                  ) : msg.status === 'failed' ? (
                                    <span
                                      style={{
                                        color: '#EF4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      <AlertCircle size={11} />
                                      <span>Failed</span>
                                      <button
                                        onClick={() => handleRetryMessage(msg)}
                                        style={{
                                          background: 'rgba(239, 68, 68, 0.2)',
                                          border: '1px solid #EF4444',
                                          color: '#FFF',
                                          borderRadius: '3px',
                                          padding: '1px 5px',
                                          fontSize: '9px',
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Retry
                                      </button>
                                    </span>
                                  ) : msg.status === 'read' ? (
                                    <CheckCheck size={12} style={{ color: '#38BDF8' }} />
                                  ) : msg.status === 'delivered' ? (
                                    <CheckCheck size={12} style={{ color: '#94A3B8' }} />
                                  ) : (
                                    <Check size={12} style={{ color: '#94A3B8' }} />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  background: '#111827',
                }}
              >
                {activeConv.status === 'closed' ? (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: '#94A3B8',
                    }}
                  >
                    This conversation is closed. Reopen it using the status selector above to reply.
                  </div>
                ) : (
                  <>
                    {/* Phase 4E: Attachment preview bar if file is selected */}
                    {selectedFile && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          {fileMediaType === 'image' && filePreviewUrl ? (
                            <img
                              src={filePreviewUrl}
                              alt="Preview"
                              style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : fileMediaType === 'video' ? (
                            <Film size={22} style={{ color: '#38BDF8' }} />
                          ) : fileMediaType === 'audio' ? (
                            <Music size={22} style={{ color: '#38BDF8' }} />
                          ) : (
                            <FileText size={22} style={{ color: '#38BDF8' }} />
                          )}
                          <div style={{ overflow: 'hidden' }}>
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#F8FAFC',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {selectedFile.name}
                            </div>
                            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                              {formatFileSize(selectedFile.size)} • {fileMediaType?.toUpperCase()}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={clearSelectedFile}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#EF4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Remove attachment"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}

                    <form
                      onSubmit={handleSendReply}
                      style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}
                    >
                      {/* Attachment trigger button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          background: selectedFile ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
                          border: selectedFile ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.12)',
                          color: selectedFile ? '#38BDF8' : '#94A3B8',
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}
                        title="Attach Media (Image, PDF, Document, Audio, Video)"
                      >
                        <Paperclip size={18} />
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                        style={{ display: 'none' }}
                      />

                      <textarea
                        placeholder={
                          selectedFile
                            ? 'Add a caption (optional)...'
                            : `Type a reply to ${resolveDisplayName(
                                activeConv
                              )} (Press Enter to send, Shift+Enter for new line)...`
                        }
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        rows={2}
                        style={{
                          flex: 1,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          color: '#F8FAFC',
                          fontSize: '13px',
                          outline: 'none',
                          resize: 'none',
                          fontFamily: 'inherit',
                          lineHeight: 1.4,
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim() && !selectedFile}
                        style={{
                          background:
                            replyText.trim() || selectedFile
                              ? 'linear-gradient(135deg, #0284C7, #0369A1)'
                              : 'rgba(255,255,255,0.06)',
                          color: replyText.trim() || selectedFile ? '#FFF' : '#64748B',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px 18px',
                          cursor: replyText.trim() || selectedFile ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          fontSize: '13px',
                          boxShadow:
                            replyText.trim() || selectedFile
                              ? '0 2px 8px rgba(2, 132, 199, 0.3)'
                              : 'none',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}
                      >
                        <Send size={15} /> Send
                      </button>
                    </form>
                  </>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                color: '#64748B',
              }}
            >
              <MessageSquare size={48} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#94A3B8' }}>
                Select a conversation
              </p>
              <p style={{ fontSize: '12px', color: '#64748B' }}>
                Choose a customer thread from the left pane to view messages.
              </p>
            </div>
          )}
        </main>

        {/* ═══════════════════════════════════════════════════════════
            PANE 3: Customer & Context Sidebar (Right, 320px)
        ═══════════════════════════════════════════════════════════ */}
        {activeConv && showRightSidebar && (
          <aside
            style={{
              width: '320px',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              background: '#0F172A',
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748B',
                  margin: 0,
                }}
              >
                Customer & Thread Context
              </h3>
            </div>

            {/* 1. Channel Profile Card */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <User size={15} style={{ color: '#38BDF8' }} />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Channel Profile</span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  color: '#94A3B8',
                }}
              >
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>
                    Display Name
                  </span>
                  <strong style={{ color: '#F8FAFC', fontSize: '13px' }}>
                    {resolveDisplayName(activeConv)}
                  </strong>
                </div>

                {activeConv.channel_identity?.phone && (
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>
                      Phone / Handle
                    </span>
                    <strong style={{ color: '#E2E8F0' }}>
                      {activeConv.channel_identity.phone}
                    </strong>
                  </div>
                )}

                {activeConv.channel_identity?.email && (
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>
                      Email
                    </span>
                    <strong style={{ color: '#E2E8F0' }}>
                      {activeConv.channel_identity.email}
                    </strong>
                  </div>
                )}

                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>
                    Platform External ID
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginTop: '2px',
                    }}
                  >
                    <span
                      style={{
                        color: '#CBD5E1',
                        fontSize: '11px',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {activeConv.channel_identity?.external_id}
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(activeConv.channel_identity?.external_id || '', 'id')
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedText === 'id' ? '#38BDF8' : '#64748B',
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                      title="Copy ID"
                    >
                      {copiedText === 'id' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Linked Customer Card */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={15} style={{ color: '#10B981' }} />
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
                <div
                  style={{
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    color: '#94A3B8',
                  }}
                >
                  <div>
                    Name: <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.full_name}</strong>
                  </div>
                  {activeConv.customer.phone && (
                    <div>
                      Phone:{' '}
                      <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.phone}</strong>
                    </div>
                  )}
                  {activeConv.customer.email && (
                    <div>
                      Email:{' '}
                      <strong style={{ color: '#E2E8F0' }}>{activeConv.customer.email}</strong>
                    </div>
                  )}
                  <a
                    href={`/crm/customers`}
                    style={{
                      color: '#38BDF8',
                      fontSize: '11px',
                      marginTop: '4px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600,
                    }}
                  >
                    View in Customer Directory <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                  No customer linked yet. Link an existing customer record to persist CRM history.
                </div>
              )}
            </div>

            {/* 3. Sales Lead Opportunity Card */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <Sparkles size={15} style={{ color: '#F59E0B' }} />
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Sales Lead Opportunity</span>
              </div>

              {activeConv.lead ? (
                <div
                  style={{
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    color: '#94A3B8',
                  }}
                >
                  <div>
                    Lead:{' '}
                    <strong style={{ color: '#E2E8F0' }}>{activeConv.lead.full_name}</strong>
                  </div>
                  <div>
                    Status:{' '}
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '10px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {activeConv.lead.status}
                    </span>
                  </div>
                  <div>
                    Source:{' '}
                    <strong style={{ color: '#E2E8F0', textTransform: 'capitalize' }}>
                      {activeConv.lead.source}
                    </strong>
                  </div>
                  <div>
                    Assigned Rep:{' '}
                    <strong style={{ color: '#E2E8F0' }}>
                      {activeConv.assigned_to_employee?.full_name || 'Unassigned'}
                    </strong>
                  </div>
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
                    Manage Lead in Pipeline <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                  No active sales lead associated with this thread.
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ─── Modal: Link Customer ───────────────────────────────── */}
      {showLinkModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: '#1E293B',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              width: '440px',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                Link Customer to Thread
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              Select an existing Customer record to associate with this channel identity and chat
              thread.
            </p>

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{
                width: '100%',
                background: '#0F172A',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#FFF',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '13px',
                marginBottom: '20px',
                outline: 'none',
              }}
            >
              <option value="">Select a customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.phone || c.email || 'No contact details'})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowLinkModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#CBD5E1',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLinkCustomer}
                disabled={!selectedCustomerId}
                style={{
                  background: '#0284C7',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 600,
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: selectedCustomerId ? 'pointer' : 'not-allowed',
                  opacity: selectedCustomerId ? 1 : 0.5,
                }}
              >
                Confirm Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Simulate Inbound Message ────────────────────── */}
      {showSimulateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: '#1E293B',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              width: '460px',
              padding: '22px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: '#A855F7' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>
                  Simulate Inbound Message
                </h3>
              </div>
              <button
                onClick={() => setShowSimulateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              Simulates a live inbound customer message from WhatsApp, Instagram, or Facebook
              Messenger to test realtime inbox updates, lead creation, and sales routing.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: '#CBD5E1',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Channel
                </label>
                <select
                  value={simChannel}
                  onChange={(e) => setSimChannel(e.target.value as ChannelType)}
                  style={{
                    width: '100%',
                    background: '#0F172A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFF',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Facebook Messenger</option>
                  <option value="mock">Mock Channel</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: '#CBD5E1',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Sender Name
                </label>
                <input
                  type="text"
                  value={simSender}
                  onChange={(e) => setSimSender(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0F172A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFF',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: '#CBD5E1',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Phone / External ID
                </label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0F172A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFF',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: '#CBD5E1',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Message Content
                </label>
                <textarea
                  value={simContent}
                  onChange={(e) => setSimContent(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#0F172A',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#FFF',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowSimulateModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#CBD5E1',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSimulateMessage}
                style={{
                  background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 600,
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Dispatch Inbound Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Media Preview Modal ─────────────────────────────── */}
      {previewModalAttachment && (
        <div
          onClick={() => setPreviewModalAttachment(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#0F172A',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#1E293B',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
                {previewModalAttachment.title}
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <a
                  href={safeMediaUrl(previewModalAttachment.url)}
                  download={previewModalAttachment.title}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#94A3B8',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                  title="Download file"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => setPreviewModalAttachment(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                  title="Close preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div
              style={{
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: 'calc(90vh - 60px)',
                overflow: 'auto',
              }}
            >
              {previewModalAttachment.type === 'image' && (
                <img
                  src={previewModalAttachment.url}
                  alt={previewModalAttachment.title}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: '6px',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
