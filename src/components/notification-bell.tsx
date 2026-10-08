// src/components/notification-bell.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Clock,
  Check,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Phone,
  CalendarCheck,
  CalendarClock,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type FollowUpNotification,
} from '@/app/(dashboard)/notification-actions';

interface NotificationBellProps {
  employeeId?: string;
}

export function NotificationBell({ employeeId: _employeeId }: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<FollowUpNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await getNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.warn('[NotificationBell] Error fetching notifications:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Initial load, periodic polling (30s), and event listeners
  useEffect(() => {
    const isMounted = true;
    async function init() {
      try {
        const res = await getNotifications();
        if (isMounted) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[NotificationBell] Error fetching notifications:', err);
        if (isMounted) setLoading(false);
      }
    }
    void init();

    const interval = setInterval(() => {
      void fetchNotifications(true);
    }, 30000);

    const handleUpdate = () => {
      void fetchNotifications(true);
    };

    window.addEventListener('follow_up_updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('follow_up_updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [fetchNotifications]);

  // Click outside & Escape key to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle Mark as Read
  const handleMarkAsRead = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    setActionInProgress(notifId);

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationAsRead(notifId);
      window.dispatchEvent(new CustomEvent('follow_up_updated'));
    } catch (err) {
      console.error('[NotificationBell] Error marking as read:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Mark All as Read
  const handleMarkAllRead = async () => {
    setActionInProgress('all');
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
      window.dispatchEvent(new CustomEvent('follow_up_updated'));
    } catch (err) {
      console.error('[NotificationBell] Error marking all as read:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Follow Up Action: marks read, navigates to chat/lead, closes modal
  const handleFollowUpNow = async (notif: FollowUpNotification) => {
    setActionInProgress(notif.id);

    // Optimistic read
    if (!notif.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      void markNotificationAsRead(notif.id);
      window.dispatchEvent(new CustomEvent('follow_up_updated'));
    }

    setIsOpen(false);
    setActionInProgress(null);

    // Navigate to conversation if available, or CRM leads
    if (notif.conversation_id) {
      router.push(`/crm/inbox?conversationId=${notif.conversation_id}`);
    } else {
      router.push('/crm/leads');
    }
  };

  const displayedNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            void fetchNotifications(true);
          }
        }}
        aria-label="تنبيهات مواعيد المتابعة"
        title="مواعيد المتابعة (Follow-up Reminders)"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          backgroundColor: isOpen ? 'var(--hover)' : 'var(--card)',
          color: unreadCount > 0 ? 'var(--foreground)' : 'var(--muted-foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--hover)';
          e.currentTarget.style.borderColor = 'rgba(174, 172, 120, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isOpen ? 'var(--hover)' : 'var(--card)';
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        <Bell size={18} style={{ color: unreadCount > 0 ? 'var(--foreground)' : 'inherit' }} />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <>
            {/* Subtle animated ping indicator */}
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                display: 'flex',
                height: '8px',
                width: '8px',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  display: 'inline-flex',
                  height: '100%',
                  width: '100%',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  opacity: 0.75,
                  animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                }}
              />
            </span>
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                minWidth: '18px',
                height: '18px',
                padding: '0 5px',
                borderRadius: '999px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '0.6875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--card)',
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Notifications Dropdown Panel - Perfectly aligned & bounded */}
      {isOpen && (
        <div
          dir="rtl"
          style={{
            position: 'absolute',
            right: 0,
            left: 'auto',
            top: 'calc(100% + 8px)',
            width: '410px',
            maxWidth: 'calc(100vw - 2rem)',
            backgroundColor: 'var(--card)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow:
              '0 20px 40px -10px rgba(0, 0, 0, 0.15), 0 8px 16px -4px rgba(0, 0, 0, 0.06)',
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1rem 1.125rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--surface-muted, rgba(174, 172, 120, 0.04))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(174, 172, 120, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}
              >
                <CalendarClock size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--foreground)' }}>
                    مواعيد المتابعة
                  </span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '999px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                  تنبيهات الفولو اب لعملاء الـ CRM
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {/* Silent refresh button */}
              <button
                type="button"
                onClick={() => void fetchNotifications(false)}
                title="تحديث المواعيد"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  padding: '5px',
                  borderRadius: '6px',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* Mark all as read */}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={actionInProgress === 'all'}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: 'var(--foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--card)';
                  }}
                >
                  <CheckCheck size={13} style={{ color: 'var(--primary)' }} />
                  <span>تحديد الكل كمقروء</span>
                </button>
              )}
            </div>
          </div>

          {/* Segmented Filter Tabs */}
          <div
            style={{
              padding: '0.625rem 1rem',
              backgroundColor: 'var(--card)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '3px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                gap: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: filter === 'all' ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: filter === 'all' ? 'var(--card)' : 'transparent',
                  color: filter === 'all' ? 'var(--foreground)' : 'var(--muted-foreground)',
                  boxShadow: filter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                الكل ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: filter === 'unread' ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: filter === 'unread' ? 'var(--card)' : 'transparent',
                  color: filter === 'unread' ? 'var(--foreground)' : 'var(--muted-foreground)',
                  boxShadow: filter === 'unread' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                غير مقروءة ({unreadCount})
              </button>
            </div>
          </div>

          {/* Notification List Body */}
          <div
            style={{
              maxHeight: '390px',
              overflowY: 'auto',
              padding: '0.5rem 0',
            }}
          >
            {loading && notifications.length === 0 ? (
              <div
                style={{
                  padding: '3rem 1rem',
                  textAlign: 'center',
                  color: 'var(--muted-foreground)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}
              >
                <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--primary)' }} />
                <span>جاري تحديث مواعيد المتابعة...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div
                style={{
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(174, 172, 120, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                  }}
                >
                  <CalendarCheck size={24} />
                </div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  لا توجد مواعيد متابعة {filter === 'unread' ? 'غير مقروءة' : 'معلقة'}
                </div>
                <div style={{ fontSize: '0.75rem', maxWidth: '260px', lineHeight: 1.5 }}>
                  أنت مطلع على جميع المواعيد! سيتم تنبيهك هنا فور حلول موعد جديد.
                </div>
              </div>
            ) : (
              displayedNotifications.map((notif) => {
                const isOverdue = notif.due_status === 'overdue';
                const isDue = notif.due_status === 'due';

                const badgeBg = isOverdue
                  ? '#fef2f2'
                  : isDue
                  ? '#fffbeb'
                  : '#eff6ff';

                const badgeColor = isOverdue
                  ? '#dc2626'
                  : isDue
                  ? '#b45309'
                  : '#2563eb';

                const badgeBorder = isOverdue
                  ? '#fecaca'
                  : isDue
                  ? '#fde68a'
                  : '#bfdbfe';

                return (
                  <div
                    key={notif.id}
                    style={{
                      margin: '6px 12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      backgroundColor: notif.is_read
                        ? 'var(--card)'
                        : 'rgba(174, 172, 120, 0.05)',
                      border: notif.is_read
                        ? '1px solid var(--border)'
                        : '1px solid rgba(174, 172, 120, 0.35)',
                      borderRight: notif.is_read
                        ? '3px solid transparent'
                        : '3px solid var(--primary)',
                      boxShadow: notif.is_read
                        ? 'none'
                        : '0 2px 6px rgba(0, 0, 0, 0.03)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.625rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = notif.is_read
                        ? 'var(--card)'
                        : 'rgba(174, 172, 120, 0.05)';
                    }}
                  >
                    {/* Row 1: Lead Name + Status Badge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--primary)',
                            color: 'var(--primary-foreground)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          }}
                        >
                          {notif.lead_name
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--foreground)' }}>
                            {notif.lead_name}
                          </div>
                          {notif.phone && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.6875rem',
                                color: 'var(--muted-foreground)',
                                marginTop: '1px',
                              }}
                            >
                              <Phone size={10} />
                              <span dir="ltr">{notif.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Pill */}
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          backgroundColor: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeBorder}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {isOverdue && <AlertCircle size={11} />}
                        {notif.status_label || 'قادم'}
                      </span>
                    </div>

                    {/* Row 2: Follow-Up Scheduled Time Box */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                        border: isOverdue ? '1px dashed rgba(239, 68, 68, 0.25)' : '1px dashed var(--border)',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                        }}
                      >
                        <Clock
                          size={14}
                          style={{
                            color: isOverdue ? '#dc2626' : 'var(--primary)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: 'var(--foreground)' }}>الموعد:</span>
                        <span
                          style={{
                            color: isOverdue ? '#dc2626' : 'var(--foreground)',
                            fontWeight: 700,
                          }}
                        >
                          {notif.formatted_time}
                        </span>
                      </div>

                      {notif.time_remaining && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: isOverdue ? '#dc2626' : 'var(--muted-foreground)',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: isOverdue ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                          }}
                        >
                          {notif.time_remaining}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Notes / Context (if any) */}
                    {notif.notes && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '5px',
                          fontSize: '0.75rem',
                          color: 'var(--muted-foreground)',
                          backgroundColor: 'rgba(0, 0, 0, 0.015)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        <FileText size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {notif.notes}
                        </span>
                      </div>
                    )}

                    {/* Row 4: Action Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '4px',
                        borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      {/* Primary "فولو اب الآن" Action */}
                      <button
                        type="button"
                        onClick={() => void handleFollowUpNow(notif)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          backgroundColor: 'var(--primary)',
                          color: 'var(--primary-foreground)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '0.9';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                      >
                        <MessageSquare size={13} />
                        <span>متابعة العميل الآن</span>
                      </button>

                      {/* Secondary "Mark as Read" Action */}
                      <div>
                        {!notif.is_read ? (
                          <button
                            type="button"
                            onClick={(e) => void handleMarkAsRead(e, notif.id)}
                            disabled={actionInProgress === notif.id}
                            title="تحديد كمقروء"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              color: 'var(--muted-foreground)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--hover)';
                              e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'var(--muted-foreground)';
                            }}
                          >
                            <Check size={12} />
                            <span>تحديد كمقروء</span>
                          </button>
                        ) : (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.6875rem',
                              color: '#16a34a',
                              fontWeight: 600,
                              padding: '0.25rem 0.5rem',
                            }}
                          >
                            <Check size={12} />
                            <span>تمت المتابعة</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '0.625rem 1rem',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--surface-muted, rgba(174, 172, 120, 0.04))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push('/crm/inbox');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>فتح صندوق المحادثات</span>
              <ExternalLink size={12} />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push('/crm/leads');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              عرض كل العملاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
