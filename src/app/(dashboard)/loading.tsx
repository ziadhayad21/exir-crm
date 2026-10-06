// src/app/(dashboard)/loading.tsx
// Instant navigation skeleton displayed immediately on sidebar navigation click.
// Eliminates navigation freeze in Next.js App Router.

import React from 'react';

export default function DashboardLoading() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        animation: 'fadeIn 0.15s ease-in-out',
        width: '100%',
        maxWidth: '100%',
      }}
    >
      {/* Top Header Skeleton */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              width: '180px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(90deg, #F3F1DF 25%, #FAF8EE 50%, #F3F1DF 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '260px',
              height: '16px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #F3F1DF 25%, #FAF8EE 50%, #F3F1DF 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div
            style={{
              width: '100px',
              height: '36px',
              borderRadius: '6px',
              background: '#F3F1DF',
            }}
          />
          <div
            style={{
              width: '110px',
              height: '36px',
              borderRadius: '6px',
              background: '#F3F1DF',
            }}
          />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius)',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '14px',
                borderRadius: '4px',
                background: '#F3F1DF',
              }}
            />
            <div
              style={{
                width: '120px',
                height: '28px',
                borderRadius: '6px',
                background: 'linear-gradient(90deg, #F3F1DF 25%, #FAF8EE 50%, #F3F1DF 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
              }}
            />
            <div
              style={{
                width: '150px',
                height: '12px',
                borderRadius: '4px',
                background: '#F3F1DF',
              }}
            />
          </div>
        ))}
      </div>

      {/* Main Content / Table Skeleton */}
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: '0 1px 3px rgba(76, 69, 65, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              width: '160px',
              height: '20px',
              borderRadius: '4px',
              background: '#F3F1DF',
            }}
          />
          <div
            style={{
              width: '200px',
              height: '32px',
              borderRadius: '6px',
              background: '#F3F1DF',
            }}
          />
        </div>

        {/* Table Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                height: '44px',
                borderRadius: '6px',
                background: i % 2 === 0 ? 'var(--surface-muted)' : '#FFFFFF',
                border: '1px solid rgba(174, 172, 120, 0.15)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 1rem',
                gap: '1rem',
              }}
            >
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#F3F1DF' }} />
              <div style={{ width: '140px', height: '14px', borderRadius: '4px', background: '#F3F1DF' }} />
              <div style={{ width: '90px', height: '14px', borderRadius: '4px', background: '#F3F1DF' }} />
              <div style={{ width: '110px', height: '14px', borderRadius: '4px', background: '#F3F1DF', marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
