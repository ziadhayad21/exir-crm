// src/components/topbar.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, User, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '@/types';
import { logoutAction } from '@/app/(dashboard)/actions';
import { NotificationBell } from '@/components/notification-bell';

interface TopbarProps {
  user: CurrentUser;
}

export function Topbar({ user }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const primaryRole = user.roles[0]?.name ?? 'No Role';

  return (
    <header
      style={{
        height: '64px',
        backgroundColor: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Left side — page context */}
      <div />

      {/* Right side — notifications & user menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <NotificationBell employeeId={user.employee.id} />

        <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius)',
            border: '1px solid transparent',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="User menu"
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: '1px solid rgba(174, 172, 120, 0.4)',
              boxShadow: '0 1px 3px rgba(76, 69, 65, 0.08)',
            }}
          >
            {user.employee.full_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              {user.employee.full_name}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--muted-foreground)',
              }}
            >
              {primaryRole}
            </div>
          </div>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--muted-foreground)',
              transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div
            className="animate-fade-in"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              width: '240px',
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              boxShadow: '0 10px 25px -5px rgba(76, 69, 65, 0.1), 0 4px 6px -2px rgba(76, 69, 65, 0.05)',
              overflow: 'hidden',
              zIndex: 50,
            }}
          >
            {/* User info */}
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--foreground)',
                }}
              >
                {user.employee.full_name}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  marginTop: '2px',
                }}
              >
                {user.employee.email}
              </div>
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                }}
              >
                {user.roles.map((role) => (
                  <span
                    key={role.id}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                      borderRadius: '999px',
                      backgroundColor: 'var(--accent)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {role.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Menu items */}
            <div style={{ padding: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  fontSize: '0.875rem',
                  color: 'var(--muted-foreground)',
                  cursor: 'default',
                }}
              >
                <User size={16} />
                <span>Profile</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.6875rem',
                    color: 'var(--muted-foreground)',
                    opacity: 0.7,
                  }}
                >
                  Phase 2
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '0.5rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <form action={logoutAction}>
                <button
                  type="submit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'calc(var(--radius) - 2px)',
                    fontSize: '0.875rem',
                    color: 'var(--destructive-foreground)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--destructive)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
