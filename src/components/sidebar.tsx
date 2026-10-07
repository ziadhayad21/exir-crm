// src/components/sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  Plane,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Users,
  Handshake,
  ChevronDown,
  Inbox,
  MessageSquare,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import type { CurrentUser } from '@/types';
import { hasPermission, hasAnyPermission } from '@/lib/auth/client-helpers';

interface SidebarProps {
  user: CurrentUser;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permissionKey?: string;
  permissionKeys?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={20} />,
  },
  {
    label: 'CRM',
    href: '/crm',
    icon: <Briefcase size={20} />,
    permissionKeys: [
      'crm.deals.read_own',
      'crm.deals.read_all',
      'crm.customers.read_own',
      'crm.customers.read_all',
      'crm.leads.read_own',
      'crm.leads.read_all',
      'crm.inbox.read_own',
      'crm.inbox.read_all',
    ],
    children: [
      {
        label: 'Inbox',
        href: '/crm/inbox',
        icon: <MessageSquare size={18} />,
        permissionKeys: ['crm.inbox.read_own', 'crm.inbox.read_all'],
      },
      {
        label: 'Customers',
        href: '/crm/customers',
        icon: <Users size={18} />,
        permissionKeys: ['crm.customers.read_own', 'crm.customers.read_all'],
      },
      {
        label: 'Leads',
        href: '/crm/leads',
        icon: <Inbox size={18} />,
        permissionKeys: ['crm.leads.read_own', 'crm.leads.read_all'],
      },
      {
        label: 'Deals',
        href: '/crm/deals',
        icon: <Handshake size={18} />,
        permissionKeys: ['crm.deals.read_own', 'crm.deals.read_all'],
      },
    ],
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: <Shield size={20} />,
    permissionKey: 'admin.manage_users',
    children: [
      {
        label: 'Employees',
        href: '/admin/employees',
        icon: <Users size={18} />,
        permissionKey: 'admin.manage_users',
      },
    ],
  },
];

function isItemVisible(item: NavItem, user: CurrentUser): boolean {
  if (item.permissionKey) {
    return hasPermission(user, item.permissionKey);
  }
  if (item.permissionKeys) {
    return hasAnyPermission(user, item.permissionKeys);
  }
  return true;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '/crm': true,
    '/admin': true,
  });

  const filteredItems = navItems.filter((item) => isItemVisible(item, user));

  // Pre-warm / prefetch all accessible dashboard routes in background on idle
  useEffect(() => {
    const prefetchRoutes = () => {
      filteredItems.forEach((item) => {
        if (item.href) router.prefetch(item.href);
        item.children?.forEach((child) => {
          if (child.href) router.prefetch(child.href);
        });
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(prefetchRoutes);
    } else {
      setTimeout(prefetchRoutes, 300);
    }
  }, [router, filteredItems]);

  return (
    <aside
      style={{
        width: collapsed ? '72px' : '256px',
        minHeight: '100vh',
        backgroundColor: 'var(--sidebar-bg)',
        borderInlineEnd: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        flexShrink: 0,
        boxShadow: '1px 0 3px 0 rgba(76, 69, 65, 0.03)',
      }}
    >
      {/* Logo Area */}
      <div
        style={{
          padding: collapsed ? '1.25rem 0.75rem' : '1.25rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid rgba(174, 172, 120, 0.4)',
            boxShadow: '0 2px 4px rgba(76, 69, 65, 0.06)',
          }}
        >
          <Plane size={22} />
        </div>
        {!collapsed && (
          <div style={{ whiteSpace: 'nowrap' }}>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--foreground)',
                letterSpacing: '-0.02em',
              }}
            >
              El-Exir
            </div>
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--muted-foreground)',
                marginTop: '-2px',
                fontWeight: 500,
              }}
            >
              Tourism ERP
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '1rem 0.75rem' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {filteredItems.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const visibleChildren = hasChildren
              ? item.children!.filter((child) => isItemVisible(child, user))
              : [];

            const isParentActive =
              pathname === item.href ||
              pathname.startsWith(item.href + '/');

            if (hasChildren && !collapsed) {
              const isGroupOpen = openGroups[item.href] ?? true;
              return (
                <div key={item.href} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [item.href]: !isGroupOpen,
                      }))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: 'none',
                      fontSize: '0.875rem',
                      fontWeight: isParentActive ? 600 : 500,
                      color: 'var(--foreground)',
                      backgroundColor: isParentActive ? 'var(--hover)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 0.15s ease',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      if (!isParentActive) {
                        e.currentTarget.style.backgroundColor = 'var(--hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isParentActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <ChevronDown
                      size={16}
                      style={{
                        transform: isGroupOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease',
                        color: 'var(--muted-foreground)',
                      }}
                    />
                  </button>

                  {isGroupOpen && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        paddingInlineStart: '1rem',
                        marginTop: '2px',
                      }}
                    >
                      {visibleChildren.map((child) => {
                        const isChildActive =
                          pathname === child.href || pathname.startsWith(child.href + '/');

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            prefetch={true}
                            onMouseEnter={(e) => {
                              router.prefetch(child.href);
                              if (!isChildActive) {
                                e.currentTarget.style.backgroundColor = 'var(--hover)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isChildActive) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.625rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 'calc(var(--radius) - 2px)',
                              textDecoration: 'none',
                              fontSize: '0.8125rem',
                              fontWeight: isChildActive ? 600 : 500,
                              color: 'var(--foreground)',
                              backgroundColor: isChildActive
                                ? 'var(--selected)'
                                : 'transparent',
                              transition: 'all 0.15s ease',
                              position: 'relative',
                            }}
                          >
                            {isChildActive && (
                              <div
                                style={{
                                  position: 'absolute',
                                  insetInlineStart: 0,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  width: '3px',
                                  height: '60%',
                                  borderRadius: '0 2px 2px 0',
                                  backgroundColor: 'var(--ink)',
                                }}
                              />
                            )}
                            <span style={{ flexShrink: 0, display: 'flex' }}>{child.icon}</span>
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Collapsed view or items without children
            const targetHref = hasChildren ? item.children![0].href : item.href;
            const isActive = isParentActive;

            return (
              <Link
                key={item.href}
                href={targetHref}
                prefetch={true}
                title={collapsed ? item.label : undefined}
                onMouseEnter={(e) => {
                  router.prefetch(targetHref);
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--hover)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: collapsed ? '0.625rem' : '0.625rem 0.875rem',
                  borderRadius: 'var(--radius)',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: 'var(--foreground)',
                  backgroundColor: isActive ? 'var(--selected)' : 'transparent',
                  transition: 'all 0.15s ease',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      insetInlineStart: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '3px',
                      height: '60%',
                      borderRadius: '0 2px 2px 0',
                      backgroundColor: 'var(--ink)',
                    }}
                  />
                )}
                <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute',
          insetInlineEnd: '-12px',
          top: '72px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          boxShadow: '0 2px 5px rgba(76, 69, 65, 0.08)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface)';
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
