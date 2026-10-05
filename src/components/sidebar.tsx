// src/components/sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { useState } from 'react';
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
    permissionKeys: ['crm.deals.read_own', 'crm.deals.read_all', 'crm.customers.read_own', 'crm.customers.read_all', 'crm.leads.read_own', 'crm.leads.read_all', 'crm.inbox.read_own', 'crm.inbox.read_all'],
    children: [
      {
        label: 'Inbox',
        href: '/crm/inbox',
        icon: <MessageSquare size={18} />,
        permissionKeys: ['crm.inbox.read_own', 'crm.inbox.read_all'],
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
      {
        label: 'Customers',
        href: '/crm/customers',
        icon: <Users size={18} />,
        permissionKeys: ['crm.customers.read_own', 'crm.customers.read_all'],
      },
    ],
  },
  {
    label: 'Administration',
    href: '/admin',
    icon: <Shield size={20} />,
    permissionKey: 'admin.system',
  },
];

function isItemVisible(item: NavItem, user: CurrentUser): boolean {
  if (item.permissionKey && !hasPermission(user, item.permissionKey)) {
    return false;
  }
  if (item.permissionKeys && !hasAnyPermission(user, item.permissionKeys)) {
    return false;
  }
  return true;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [crmOpen, setCrmOpen] = useState(true);

  const filteredItems = navItems.filter((item) => isItemVisible(item, user));

  return (
    <aside
      style={{
        width: collapsed ? '72px' : '256px',
        minHeight: '100vh',
        background: 'hsl(222 47% 11%)',
        borderRight: '1px solid hsla(0 0% 100% / 0.06)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Logo Area */}
      <div
        style={{
          padding: collapsed ? '1.25rem 0.75rem' : '1.25rem 1.25rem',
          borderBottom: '1px solid hsla(0 0% 100% / 0.06)',
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
            background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Plane size={22} color="white" />
        </div>
        {!collapsed && (
          <div style={{ whiteSpace: 'nowrap' }}>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-0.025em',
              }}
            >
              El-Exir
            </div>
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'hsla(220 14% 80% / 0.5)',
                marginTop: '-2px',
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
              pathname === item.href || pathname.startsWith(item.href + '/');

            if (hasChildren && !collapsed) {
              return (
                <div key={item.href} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    onClick={() => setCrmOpen(!crmOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      borderRadius: '0.5rem',
                      border: 'none',
                      fontSize: '0.875rem',
                      fontWeight: isParentActive ? 600 : 500,
                      color: isParentActive ? 'white' : 'hsl(220 14% 65%)',
                      background: isParentActive ? 'hsla(217 91% 50% / 0.12)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      if (!isParentActive) {
                        e.currentTarget.style.background = 'hsla(0 0% 100% / 0.05)';
                        e.currentTarget.style.color = 'hsl(220 14% 85%)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isParentActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'hsl(220 14% 65%)';
                      }
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <ChevronDown
                      size={16}
                      style={{
                        transform: crmOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease',
                        opacity: 0.6,
                      }}
                    />
                  </button>

                  {crmOpen && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        paddingLeft: '1rem',
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
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.625rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              textDecoration: 'none',
                              fontSize: '0.8125rem',
                              fontWeight: isChildActive ? 600 : 400,
                              color: isChildActive ? 'white' : 'hsl(220 14% 60%)',
                              background: isChildActive
                                ? 'hsla(217 91% 50% / 0.18)'
                                : 'transparent',
                              transition: 'all 0.15s ease',
                              position: 'relative',
                            }}
                            onMouseEnter={(e) => {
                              if (!isChildActive) {
                                e.currentTarget.style.background = 'hsla(0 0% 100% / 0.05)';
                                e.currentTarget.style.color = 'hsl(220 14% 85%)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isChildActive) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'hsl(220 14% 60%)';
                              }
                            }}
                          >
                            {isChildActive && (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  width: '3px',
                                  height: '60%',
                                  borderRadius: '0 2px 2px 0',
                                  background: 'hsl(217 91% 50%)',
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
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: collapsed ? '0.625rem' : '0.625rem 0.875rem',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'white' : 'hsl(220 14% 65%)',
                  background: isActive ? 'hsla(217 91% 50% / 0.15)' : 'transparent',
                  transition: 'all 0.15s ease',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'hsla(0 0% 100% / 0.05)';
                    e.currentTarget.style.color = 'hsl(220 14% 85%)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'hsl(220 14% 65%)';
                  }
                }}
              >
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '3px',
                      height: '60%',
                      borderRadius: '0 2px 2px 0',
                      background: 'hsl(217 91% 50%)',
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
          right: '-12px',
          top: '72px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'hsl(222 47% 18%)',
          border: '1px solid hsla(0 0% 100% / 0.1)',
          color: 'hsl(220 14% 65%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'hsl(217 91% 50%)';
          e.currentTarget.style.color = 'white';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'hsl(222 47% 18%)';
          e.currentTarget.style.color = 'hsl(220 14% 65%)';
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
