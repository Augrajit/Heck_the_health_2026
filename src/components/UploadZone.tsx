import { useCallback, useRef, useState } from 'react';

interface Props {
  onFiles: (files: File[]) => void;   // multi-file aware
  disabled?: boolean;
}

export function UploadZone({ onFiles, disabled }: Props) {
  const singleRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [pickedCount, setPickedCount] = useState(0);

  const process = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(f =>
      f.name.toLowerCase().endsWith('.dcm') ||
      f.name.toLowerCase().endsWith('.zip') ||
      // some DICOM files have no extension
      f.type === 'application/octet-stream' || f.type === ''
    );
    const allFiles = files.length > 0 ? files : Array.from(fileList); // fallback: accept all
    setPickedCount(allFiles.length);
    onFiles(allFiles);
  }, [onFiles]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    process(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (disabled) return;
    process(e.dataTransfer.files);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragActive(true); }}
      onDragLeave={() => setIsDragActive(false)}
      className={`drop-zone ${isDragActive ? 'active' : ''}`}
      id="dicom-upload-zone"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: '28px 20px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'default',
        opacity: disabled ? 0.5 : 1,
        minHeight: 200,
      }}
    >
      {/* Hidden inputs */}
      <input
        ref={singleRef}
        id="dicom-file-input"
        type="file"
        accept=".dcm,.zip,application/octet-stream,application/zip"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />
      <input
        ref={folderRef}
        id="dicom-folder-input"
        type="file"
        /* @ts-ignore — webkitdirectory is non-standard but widely supported */
        webkitdirectory=""
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {/* Icon */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)',
        flexShrink: 0,
      }}>
        <svg width="28" height="28" fill="none" stroke="#06b6d4" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>

      {/* Text */}
      <div>
        <p style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          {isDragActive ? 'Drop your DICOM files here…' : 'Drag & drop DICOM files here'}
        </p>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          Select one file, multiple files, or an entire folder of .dcm slices
        </p>
      </div>

      {/* Confirmed count badge */}
      {pickedCount > 0 && (
        <div style={{
          padding: '4px 12px', borderRadius: 20,
          background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
          color: '#22d3ee', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
        }}>
          ✓ {pickedCount} file{pickedCount > 1 ? 's' : ''} selected
        </div>
      )}

      {/* Buttons row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Multi-file picker */}
        <button
          type="button"
          onClick={() => singleRef.current?.click()}
          disabled={disabled}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '0 4px 15px rgba(6,182,212,0.25)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Select Files (.dcm)
        </button>

        {/* Folder picker */}
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          disabled={disabled}
          style={{
            padding: '10px 20px',
            background: 'rgba(124,58,237,0.15)',
            color: '#a78bfa', border: '1px solid rgba(124,58,237,0.35)',
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          Select Folder
        </button>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['.dcm × 300', 'CT series', 'MRI series', '.zip'].map(t => (
          <span key={t} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            padding: '3px 7px', borderRadius: 4,
            background: 'rgba(6,182,212,0.06)', color: '#64748b',
            border: '1px solid rgba(6,182,212,0.15)',
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
