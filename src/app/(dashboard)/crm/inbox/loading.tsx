// src/app/(dashboard)/crm/inbox/loading.tsx
// Instant 3-pane chat skeleton displayed when clicking Inbox in sidebar.

import React from 'react';

export default function InboxLoading() {
  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 7rem)',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(76, 69, 65, 0.05)',
        animation: 'fadeIn 0.15s ease-in-out',
      }}
    >
      {/* Pane 1: Conversations list skeleton (340px) */}
      <div
        style={{
          width: '340px',
          borderRight: '1px solid var(--border)',
          backgroundColor: 'var(--sidebar-bg)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1rem',
          gap: '1rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '120px', height: '22px', borderRadius: '4px', background: '#F3F1DF' }} />
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#F3F1DF' }} />
        </div>
        <div style={{ width: '100%', height: '36px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid var(--border)' }} />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: '60px', height: '26px', borderRadius: '14px', background: '#F3F1DF' }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px',
                borderRadius: '8px',
                background: i === 1 ? 'var(--selected)' : '#FFFFFF',
                border: '1px solid rgba(174, 172, 120, 0.2)',
              }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F3F1DF', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ width: '110px', height: '14px', borderRadius: '4px', background: '#F3F1DF' }} />
                <div style={{ width: '160px', height: '12px', borderRadius: '4px', background: '#FAF8EE' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pane 2: Message view skeleton (flex: 1) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--surface-muted)',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: '64px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#F3F1DF' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ width: '140px', height: '16px', borderRadius: '4px', background: '#F3F1DF' }} />
              <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: '#FAF8EE' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ width: '80px', height: '32px', borderRadius: '6px', background: '#F3F1DF' }} />
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#F3F1DF' }} />
          </div>
        </div>

        {/* Message bubbles body */}
        <div
          style={{
            flex: 1,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            justifyContent: 'flex-end',
          }}
        >
          <div style={{ alignSelf: 'flex-start', width: '220px', height: '44px', borderRadius: '12px', background: 'var(--bubble-incoming)', border: '1px solid var(--bubble-incoming-border)' }} />
          <div style={{ alignSelf: 'flex-end', width: '280px', height: '56px', borderRadius: '12px', background: 'var(--bubble-outgoing)' }} />
          <div style={{ alignSelf: 'flex-start', width: '190px', height: '38px', borderRadius: '12px', background: 'var(--bubble-incoming)', border: '1px solid var(--bubble-incoming-border)' }} />
          <div style={{ alignSelf: 'flex-end', width: '240px', height: '48px', borderRadius: '12px', background: 'var(--bubble-outgoing)' }} />
        </div>

        {/* Composer bar */}
        <div
          style={{
            height: '72px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F3F1DF' }} />
          <div style={{ flex: 1, height: '42px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'var(--primary)' }} />
        </div>
      </div>

      {/* Pane 3: Contact details skeleton (280px) */}
      <div
        style={{
          width: '280px',
          borderLeft: '1px solid var(--border)',
          backgroundColor: 'var(--card)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F3F1DF' }} />
          <div style={{ width: '120px', height: '16px', borderRadius: '4px', background: '#F3F1DF' }} />
          <div style={{ width: '160px', height: '12px', borderRadius: '4px', background: '#FAF8EE' }} />
        </div>
        <div style={{ width: '100%', height: '1px', background: 'var(--border)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ width: '90px', height: '14px', borderRadius: '4px', background: '#F3F1DF' }} />
          <div style={{ width: '100%', height: '32px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <div style={{ width: '100%', height: '32px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)' }} />
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
