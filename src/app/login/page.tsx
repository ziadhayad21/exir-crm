// src/app/login/page.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';
import { Plane, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result.success) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError(result.error ?? 'An unexpected error occurred');
      }
    });
  }

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
      {/* Decorative background elements */}
      <div
        style={{
          position: 'fixed',
          top: '-20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(217 91% 50% / 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: '-20%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(262 83% 58% / 0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '420px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo / Branding */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '2rem',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
              marginBottom: '1rem',
              boxShadow: '0 8px 32px hsla(217 91% 50% / 0.3)',
            }}
          >
            <Plane size={32} color="white" />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.025em',
            }}
          >
            El-Exir
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'hsla(220 14% 80% / 0.8)',
              marginTop: '0.25rem',
            }}
          >
            Tourism Management System
          </p>
        </div>

        {/* Login Card */}
        <div
          style={{
            background: 'hsla(0 0% 100% / 0.06)',
            backdropFilter: 'blur(24px)',
            border: '1px solid hsla(0 0% 100% / 0.1)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 24px 48px hsla(0 0% 0% / 0.2)',
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'white',
              marginBottom: '0.25rem',
            }}
          >
            Welcome back
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'hsla(220 14% 80% / 0.7)',
              marginBottom: '1.5rem',
            }}
          >
            Sign in to your account to continue
          </p>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'hsla(0 72% 51% / 0.15)',
                border: '1px solid hsla(0 72% 51% / 0.3)',
                borderRadius: '0.5rem',
                color: 'hsl(0 72% 70%)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'hsla(220 14% 80% / 0.9)',
                  marginBottom: '0.5rem',
                }}
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                disabled={isPending}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  background: 'hsla(0 0% 100% / 0.07)',
                  border: '1px solid hsla(0 0% 100% / 0.12)',
                  borderRadius: '0.5rem',
                  color: 'white',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(217 91% 50%)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px hsla(217 91% 50% / 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'hsla(0 0% 100% / 0.12)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'hsla(220 14% 80% / 0.9)',
                  marginBottom: '0.5rem',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isPending}
                  style={{
                    width: '100%',
                    padding: '0.75rem 3rem 0.75rem 1rem',
                    fontSize: '0.9375rem',
                    background: 'hsla(0 0% 100% / 0.07)',
                    border: '1px solid hsla(0 0% 100% / 0.12)',
                    borderRadius: '0.5rem',
                    color: 'white',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'hsl(217 91% 50%)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px hsla(217 91% 50% / 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'hsla(0 0% 100% / 0.12)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'hsla(220 14% 80% / 0.6)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'white',
                background: isPending
                  ? 'hsl(217 91% 40%)'
                  : 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: isPending ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: '0 4px 16px hsla(217 91% 50% / 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'hsla(220 14% 80% / 0.4)',
            marginTop: '1.5rem',
          }}
        >
          El-Exir Tourism Company • Management System
        </p>
      </div>
    </div>
  );
}
