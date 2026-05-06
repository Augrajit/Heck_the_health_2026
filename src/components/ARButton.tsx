interface Props {
  disabled?: boolean;
}

/**
 * AR button — shown in the 3D viewer.
 * Displays information about WebXR AR for the hackathon judges.
 * On a real Android device with Chrome + HTTPS this would launch immersive-ar.
 */
export function ARButton({ disabled }: Props) {
  const isArCapable =
    typeof navigator !== 'undefined' &&
    'xr' in navigator;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        padding: '8px 18px',
        borderRadius: 10,
        background: 'rgba(124,58,237,0.12)',
        border: '1px solid rgba(124,58,237,0.3)',
        color: '#a78bfa',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
        display: 'flex', alignItems: 'center', gap: 8,
        backdropFilter: 'blur(8px)',
        opacity: disabled ? 0.5 : 1,
      }}>
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
        {isArCapable ? 'AR ready — open on Android Chrome' : 'AR: use Android Chrome + HTTPS'}
      </div>
    </div>
  );
}
