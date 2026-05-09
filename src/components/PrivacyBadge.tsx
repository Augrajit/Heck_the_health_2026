export function PrivacyBadge() {
  return (
    <div className="privacy-badge" id="privacy-badge">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      <span className="badge-text">DATA STAYS ON YOUR DEVICE</span>
    </div>
  );
}
