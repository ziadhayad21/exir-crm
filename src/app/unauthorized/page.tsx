// src/app/unauthorized/page.tsx
'use client';

import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background)',
        padding: '1.5rem',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          textAlign: 'center',
          maxWidth: '420px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          padding: '2.5rem 2rem',
          boxShadow: '0 8px 24px -4px rgba(76, 69, 65, 0.06)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: 'var(--destructive)',
            border: '1px solid var(--destructive-border)',
            marginBottom: '1.5rem',
          }}
        >
          <ShieldOff size={36} color="var(--destructive-foreground)" />
        </div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--foreground)',
            marginBottom: '0.5rem',
          }}
        >
          Access Denied
        </h1>
        <p
          style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.9375rem',
            marginBottom: '2rem',
            lineHeight: 1.6,
          }}
        >
          You don&apos;t have permission to access this page. Contact an administrator if you believe this is an error.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            borderRadius: 'var(--radius)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9375rem',
            border: '1px solid rgba(174, 172, 120, 0.4)',
            boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary)';
          }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
