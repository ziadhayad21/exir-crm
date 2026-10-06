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
          borderBottom: '1px solid hsla(220 13% 91% / 1)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              width: '180px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(90deg, #E2E8F0 25%, #EDF2F7 50%, #E2E8F0 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '260px',
              height: '16px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #E2E8F0 25%, #EDF2F7 50%, #E2E8F0 75%)',
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
              background: '#E2E8F0',
            }}
          />
          <div
            style={{
              width: '110px',
              height: '36px',
              borderRadius: '6px',
              background: '#E2E8F0',
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
              borderRadius: '8px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '14px',
                borderRadius: '4px',
                background: '#E2E8F0',
              }}
            />
            <div
              style={{
                width: '120px',
                height: '24px',
                borderRadius: '4px',
                background: '#CBD5E1',
              }}
            />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton (Table / List) */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          minHeight: '400px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Table Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '240px',
              height: '36px',
              borderRadius: '6px',
              background: '#E2E8F0',
            }}
          />
          <div
            style={{
              width: '140px',
              height: '36px',
              borderRadius: '6px',
              background: '#E2E8F0',
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                height: '48px',
                borderRadius: '6px',
                background: i % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                border: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                padding: '0 1rem',
                gap: '1.5rem',
              }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E2E8F0' }} />
              <div style={{ width: '140px', height: '14px', borderRadius: '4px', background: '#E2E8F0' }} />
              <div style={{ width: '100px', height: '14px', borderRadius: '4px', background: '#E2E8F0' }} />
              <div style={{ flex: 1 }} />
              <div style={{ width: '80px', height: '14px', borderRadius: '4px', background: '#E2E8F0' }} />
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
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
