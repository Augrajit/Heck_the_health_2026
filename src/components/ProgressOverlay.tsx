interface Props {
  progress: number;
  label: string;
}

export function ProgressOverlay({ progress, label }: Props) {
  return (
    <div className="animate-fade-in flex flex-col gap-3" id="progress-overlay">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium" style={{ color: '#94a3b8' }}>{label}</span>
        <span className="text-xs-mono" style={{ color: '#06b6d4' }}>{progress}%</span>
      </div>
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="animate-spin-slow w-3 h-3 rounded-full border border-cyan-400"
          style={{ borderColor: '#22d3ee', borderTopColor: 'transparent' }} />
        <span className="text-xs" style={{ color: '#475569' }}>Processing on your device — no data is uploaded</span>
      </div>
    </div>
  );
}
