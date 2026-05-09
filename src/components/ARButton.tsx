import { useState } from 'react';

interface Props {
  disabled?: boolean;
}

/**
 * AR button — shown in the 3D viewer.
 * Attempts WebXR immersive-ar on capable devices (Android Chrome + HTTPS).
 * Shows a clear status message when AR is not supported.
 */
export function ARButton({ disabled }: Props) {
  const [status, setStatus] = useState<string | null>(null);

  const isXrPresent =
    typeof navigator !== 'undefined' && 'xr' in navigator;

  const handleClick = async () => {
    if (disabled) return;

    if (!isXrPresent) {
      setStatus('AR requires Android Chrome over HTTPS');
      return;
    }

    try {
      const supported = await (navigator as any).xr.isSessionSupported('immersive-ar');
      if (!supported) {
        setStatus('AR not supported on this device/browser');
        return;
      }
      const session = await (navigator as any).xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
      });
      // Session started — hand off to the browser's native AR UI
      session.addEventListener('end', () => setStatus(null));
      setStatus('AR session started');
    } catch (err: any) {
      setStatus(err?.message ?? 'Could not start AR session');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        id="ar-launch-btn"
        onClick={handleClick}
        disabled={!!disabled}
        style={{
          padding: '8px 18px',
          borderRadius: 10,
          background: 'rgba(124,58,237,0.12)',
          border: '1px solid rgba(124,58,237,0.3)',
          color: disabled ? '#475569' : '#a78bfa',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', alignItems: 'center', gap: 8,
          backdropFilter: 'blur(8px)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124,58,237,0.6)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(124,58,237,0.3)'; }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
        {isXrPresent ? 'Launch AR' : 'AR: Android Chrome + HTTPS'}
      </button>

      {status && (
        <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
          {status}
        </span>
      )}
    </div>
  );
}
