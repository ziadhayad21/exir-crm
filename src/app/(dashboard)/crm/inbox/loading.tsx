// src/app/(dashboard)/crm/inbox/loading.tsx
// Instant 3-pane chat skeleton displayed when clicking Inbox in sidebar.

import React from 'react';

export default function InboxLoading() {
  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 7rem)',
        background: '#0F172A',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        animation: 'fadeIn 0.15s ease-in-out',
      }}
    >
      {/* Pane 1: Conversations list skeleton (340px) */}
      <div
        style={{
          width: '340px',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#0B1120',
          display: 'flex',
          flexDirection: 'column',
          padding: '1rem',
          gap: '1rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '120px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} />
        </div>
        <div style={{ width: '100%', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: '60px', height: '26px', borderRadius: '14px', background: 'rgba(255,255,255,0.08)' }} />
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
                background: i === 1 ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ width: '110px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.15)' }} />
                <div style={{ width: '160px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pane 2: Active Chat Messages skeleton (Flex 1) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#0F172A',
        }}
      >
        {/* Chat Header */}
        <div
          style={{
            height: '64px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.25rem',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ width: '130px', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </div>
        </div>

        {/* Chat History Bubbles */}
        <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'flex-end' }}>
          <div style={{ alignSelf: 'flex-start', width: '260px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ alignSelf: 'flex-end', width: '220px', height: '42px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)' }} />
          <div style={{ alignSelf: 'flex-start', width: '310px', height: '54px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ alignSelf: 'flex-end', width: '180px', height: '38px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.2)' }} />
        </div>

        {/* Chat Composer */}
        <div
          style={{
            height: '68px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ flex: 1, height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.3)' }} />
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
