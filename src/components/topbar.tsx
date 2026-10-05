// src/components/topbar.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, User, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '@/types';
import { logoutAction } from '@/app/(dashboard)/actions';

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
        background: 'white',
        borderBottom: '1px solid hsl(220 13% 91%)',
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

      {/* Right side — user menu */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'hsl(220 14% 96%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          aria-label="User menu"
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.875rem',
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
                color: 'hsl(222 47% 11%)',
              }}
            >
              {user.employee.full_name}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'hsl(220 8% 46%)',
              }}
            >
              {primaryRole}
            </div>
          </div>
          <ChevronDown
            size={16}
            style={{
              color: 'hsl(220 8% 46%)',
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
              background: 'white',
              borderRadius: '0.75rem',
              border: '1px solid hsl(220 13% 91%)',
              boxShadow: '0 10px 40px hsla(0 0% 0% / 0.12)',
              overflow: 'hidden',
              zIndex: 50,
            }}
          >
            {/* User info */}
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid hsl(220 13% 91%)',
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'hsl(222 47% 11%)',
                }}
              >
                {user.employee.full_name}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'hsl(220 8% 46%)',
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
                      background: 'hsla(217 91% 50% / 0.1)',
                      color: 'hsl(217 91% 40%)',
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
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'hsl(220 8% 46%)',
                  cursor: 'default',
                }}
              >
                <User size={16} />
                <span>Profile</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.6875rem',
                    color: 'hsl(220 8% 70%)',
                  }}
                >
                  Phase 2
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '0.5rem',
                borderTop: '1px solid hsl(220 13% 91%)',
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
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: 'hsl(0 72% 51%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'hsla(0 72% 51% / 0.05)';
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
    </header>
  );
}
