interface TissueState {
  vessels: boolean;
  tumor: boolean;
  bone: boolean;
}

interface Props {
  tissues: TissueState;
  onToggle: (t: keyof TissueState) => void;
  clipValue: number;
  onClip: (v: number) => void;
  disabled?: boolean;
}

export function ControlPanel({ tissues, onToggle, clipValue, onClip, disabled }: Props) {
  const pct = `${clipValue * 100}%`;

  return (
    <div className="flex flex-col gap-5" id="control-panel">
      {/* Tissue toggles */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
          Tissue Layers
        </p>
        <div className="flex flex-col gap-2">
          <button
            id="toggle-vessels"
            className={`tissue-toggle vessels ${tissues.vessels ? 'active' : ''}`}
            onClick={() => onToggle('vessels')}
            disabled={disabled}
          >
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} />
            Blood Vessels
          </button>
          <button
            id="toggle-tumor"
            className={`tissue-toggle tumor ${tissues.tumor ? 'active' : ''}`}
            onClick={() => onToggle('tumor')}
            disabled={disabled}
          >
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f59e0b' }} />
            Tumor / Soft Tissue
          </button>
          <button
            id="toggle-bone"
            className={`tissue-toggle bone ${tissues.bone ? 'active' : ''}`}
            onClick={() => onToggle('bone')}
            disabled={disabled}
          >
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#9ca3af' }} />
            Bone Structure
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* Clipping plane */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#475569' }}>
          Axial Clip Plane
        </p>
        <input
          id="clip-plane-slider"
          type="range"
          min={0} max={1} step={0.01}
          value={clipValue}
          onChange={e => onClip(parseFloat(e.target.value))}
          className="clip-slider"
          style={{ '--pct': pct } as React.CSSProperties}
          disabled={disabled}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs-mono" style={{ color: '#475569' }}>Superior</span>
          <span className="text-xs-mono" style={{ color: '#475569' }}>Inferior</span>
        </div>
      </div>
    </div>
  );
}
