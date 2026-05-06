import { useEffect, useRef } from 'react';

interface Props {
  imageData: ImageData | null;
  label?: string;
  compact?: boolean;
}

export function SlicePreview({ imageData, label, compact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!imageData || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = imageData.width;
    canvasRef.current.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  if (!imageData) return null;

  const size = compact ? 72 : 200;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 4 : 8 }}>
      <div style={{
        border: '1px solid rgba(6,182,212,0.3)',
        borderRadius: compact ? 6 : 8,
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(6,182,212,0.1)',
        width: size,
        height: size,
        background: '#000',
      }}>
        <canvas
          ref={canvasRef}
          id="slice-preview-canvas"
          style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain' }}
        />
      </div>
      {label && (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: compact ? 9 : 11, color: '#64748b' }}>{label}</p>
      )}
    </div>
  );
}

