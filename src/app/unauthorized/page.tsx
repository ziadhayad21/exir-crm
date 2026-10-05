// src/app/unauthorized/page.tsx
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
        background: 'linear-gradient(135deg, hsl(222 47% 11%) 0%, hsl(217 91% 20%) 50%, hsl(262 60% 20%) 100%)',
        padding: '1rem',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          textAlign: 'center',
          maxWidth: '400px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'hsla(0 72% 51% / 0.15)',
            marginBottom: '1.5rem',
          }}
        >
          <ShieldOff size={40} color="hsl(0 72% 60%)" />
        </div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'white',
            marginBottom: '0.5rem',
          }}
        >
          Access Denied
        </h1>
        <p
          style={{
            color: 'hsla(220 14% 80% / 0.7)',
            fontSize: '0.9375rem',
            marginBottom: '2rem',
            lineHeight: 1.6,
          }}
        >
          You don&apos;t have permission to access this page.
          Contact an administrator if you believe this is an error.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
            color: 'white',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9375rem',
            boxShadow: '0 4px 16px hsla(217 91% 50% / 0.3)',
            transition: 'opacity 0.2s',
          }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
