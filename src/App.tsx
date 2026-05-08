import { useState, useRef, useCallback } from 'react';
import { SlicePreview } from './components/SlicePreview';
import { BabylonCanvas, SceneHandle } from './components/BabylonCanvas';
import { ControlPanel } from './components/ControlPanel';
import { PubMedSidebar } from './components/PubMedSidebar';
import { ARButton } from './components/ARButton';
import { PrivacyBadge } from './components/PrivacyBadge';
import { ProgressOverlay } from './components/ProgressOverlay';
import { UploadZone } from './components/UploadZone';
import { parseDicomBuffer, parseDicomSlice, sliceToImageData, extractSlice } from './lib/dicomParser';
import { generateSyntheticPhantom, phantomSliceToImageData } from './lib/syntheticPhantom';
import { fetchPubMedArticles, PubMedArticle } from './lib/pubmedApi';
import type { SegmentationResult, ScanType } from './workers/segmentation.worker';

type AppStage = 'upload' | 'processing' | 'viewer';
interface TissueState { vessels: boolean; tumor: boolean; bone: boolean; }

const SCAN_TYPES: { value: ScanType; label: string; hint: string }[] = [
  { value: 'brain',   label: 'Brain',   hint: 'Cerebral vessels, lesions & skull' },
  { value: 'abdomen', label: 'Abdomen', hint: 'Aorta, organs & soft tissue' },
  { value: 'chest',   label: 'Chest',   hint: 'Pulmonary vessels, nodules & ribs' },
];

export default function App() {
  const [stage, setStage] = useState<AppStage>('upload');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [slicePreview, setSlicePreview] = useState<ImageData | null>(null);
  const [sliceLabel, setSliceLabel] = useState('');
  const [tissues, setTissues] = useState<TissueState>({ vessels: true, tumor: true, bone: true });
  const [clipValue, setClipValue] = useState(1);
  const [articles, setArticles] = useState<PubMedArticle[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [meshReady, setMeshReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scanType, setScanType] = useState<ScanType>('abdomen');

  const sceneRef = useRef<SceneHandle>(null);
  const workerRef = useRef<Worker | null>(null);

  // ── Segmentation pipeline ──────────────────────────────────────
  const runSegmentation = useCallback((
    data: Float32Array, nx: number, ny: number, nz: number,
    modality: string, study: string
  ) => {
    setStage('processing');
    setProgress(5);
    setProgressLabel('Starting segmentation worker…');
    setMeshReady(false);

    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(
      new URL('./workers/segmentation.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.value);
        setProgressLabel(msg.label);
      } else if (msg.type === 'error') {
        setErrorMsg(`Segmentation failed: ${msg.message}`);
        setStage('upload');
        worker.terminate();
      } else if (msg.type === 'done') {
        const result = msg.result as SegmentationResult;
        setProgress(100);
        setProgressLabel('Rendering 3D model…');
        setTimeout(() => {
          sceneRef.current?.updateMeshes(result);
          setMeshReady(true);
          setStage('viewer');
          worker.terminate();
        }, 200);

        setPubLoading(true);
        fetchPubMedArticles(modality, study).then(arts => {
          setArticles(arts);
          setPubLoading(false);
        });
      }
    };

    worker.onerror = (e) => {
      setErrorMsg(`Segmentation error: ${e.message}`);
      setStage('upload');
      worker.terminate();
    };

    worker.postMessage({ data, nx, ny, nz, scanType }, [data.buffer]);
  }, [scanType]);

  // ── DICOM file(s) upload ──────────────────────────────────────
  const handleFiles = useCallback(async (files: File[]) => {
    setErrorMsg('');
    setInfoMsg('');
    if (files.length === 0) return;

    try {
      // ── Single file: use original single-buffer parser ────────
      if (files.length === 1) {
        const buffer = await files[0].arrayBuffer();
        const volume = parseDicomBuffer(buffer);
        const midSlice = Math.floor(volume.sliceCount / 2);
        const slice = extractSlice(volume, midSlice);
        setSlicePreview(sliceToImageData(slice, volume.width, volume.height));
        setSliceLabel(`Axial ${midSlice + 1}/${volume.sliceCount} · ${volume.metadata.modality}`);

        const { metadata, pixelData, width, height, sliceCount } = volume;
        if (sliceCount < 4) {
          setInfoMsg(
            `This is a 2D DICOM (${sliceCount} slice). For a full 3D model, ` +
            `select an entire CT series folder or multiple .dcm files (50–300 slices). ` +
            `The Demo Phantom shows what a full 3D render looks like.`
          );
          // Extrude single slice into a thin volume so at least something renders
          const EXTRUDE = 48;
          const extruded = new Float32Array(width * height * EXTRUDE);
          const sliceBytes = width * height;
          const huSlice = new Float32Array(sliceBytes);
          for (let i = 0; i < sliceBytes; i++)
            huSlice[i] = (pixelData[i] ?? 0) * metadata.rescaleSlope + metadata.rescaleIntercept;
          for (let z = 0; z < EXTRUDE; z++)
            extruded.set(huSlice, z * sliceBytes);
          runSegmentation(extruded, width, height, EXTRUDE, metadata.modality, metadata.studyDescription);
          return;
        }
        const huData = new Float32Array(width * height * sliceCount);
        for (let i = 0; i < huData.length; i++)
          huData[i] = (pixelData[i] ?? 0) * metadata.rescaleSlope + metadata.rescaleIntercept;
        runSegmentation(huData, width, height, sliceCount, metadata.modality, metadata.studyDescription);
        return;
      }

      // ── Multi-file CT series ──────────────────────────────────
      setProgressLabel(`Reading ${files.length} DICOM files…`);
      setProgress(2);
      setStage('processing');

      // Parse all files in parallel (batch of 20 to avoid OOM)
      const BATCH = 20;
      const slices = [];
      for (let b = 0; b < files.length; b += BATCH) {
        const batch = files.slice(b, b + BATCH);
        const parsed = await Promise.all(
          batch.map(async f => {
            const buf = await f.arrayBuffer();
            return parseDicomSlice(buf);
          })
        );
        slices.push(...parsed);
        setProgress(Math.round(5 + (b / files.length) * 15));
        setProgressLabel(`Parsed ${Math.min(b + BATCH, files.length)} / ${files.length} slices…`);
      }

      // Sort by Instance Number, fall back to z-position
      slices.sort((a, b) =>
        a.instanceNumber !== b.instanceNumber
          ? a.instanceNumber - b.instanceNumber
          : a.imagePosition - b.imagePosition
      );

      // Validate: all slices must be the same size
      const { width, height, metadata } = slices[0];
      const badSlice = slices.find(s => s.width !== width || s.height !== height);
      if (badSlice) throw new Error(
        `Inconsistent slice dimensions: expected ${width}×${height}, got ${badSlice.width}×${badSlice.height}`
      );

      // Preview mid-slice
      const midSlice = slices[Math.floor(slices.length / 2)];
      const sliceBytes = width * height;
      const previewData = new Float32Array(sliceBytes);
      for (let i = 0; i < sliceBytes; i++)
        previewData[i] = (midSlice.pixelData[i] ?? 0) * midSlice.metadata.rescaleSlope + midSlice.metadata.rescaleIntercept;

      const winCenter = metadata.modality === 'CT' ? 40 : 128;
      const winWidth = metadata.modality === 'CT' ? 400 : 256;
      // Import lazily to avoid circular dependency
      const { sliceToImageData: s2i } = await import('./lib/dicomParser');
      setSlicePreview(s2i(previewData, width, height, winCenter, winWidth));
      setSliceLabel(`Axial ${Math.floor(slices.length / 2) + 1}/${slices.length} · ${metadata.modality}`);

      // Assemble full HU volume
      setProgressLabel('Assembling volume…');
      setProgress(22);
      const huData = new Float32Array(width * height * slices.length);
      for (let z = 0; z < slices.length; z++) {
        const s = slices[z];
        const offset = z * sliceBytes;
        for (let i = 0; i < sliceBytes; i++)
          huData[offset + i] = (s.pixelData[i] ?? 0) * s.metadata.rescaleSlope + s.metadata.rescaleIntercept;
      }

      runSegmentation(huData, width, height, slices.length,
        metadata.modality, metadata.studyDescription);

    } catch (err) {
      setErrorMsg(`DICOM parse failed: ${err instanceof Error ? err.message : String(err)}`);
      setStage('upload');
    }
  }, [runSegmentation]);

  // ── Demo phantom ──────────────────────────────────────────────
  const handleDemo = useCallback(() => {
    setErrorMsg('');
    setInfoMsg('');
    const phantom = generateSyntheticPhantom();
    const midSlice = Math.floor(phantom.nz / 2);
    setSlicePreview(phantomSliceToImageData(phantom, midSlice));
    setSliceLabel(`Demo · Axial ${midSlice + 1}/${phantom.nz}`);
    runSegmentation(phantom.data, phantom.nx, phantom.ny, phantom.nz,
      'CT', 'Abdominal vasculature');
  }, [runSegmentation]);

  const toggleTissue = useCallback((key: keyof TissueState) => {
    setTissues(prev => {
      const next = { ...prev, [key]: !prev[key] };
      sceneRef.current?.setVisibility(key, next[key]);
      return next;
    });
  }, []);

  const handleClip = useCallback((v: number) => {
    setClipValue(v);
    sceneRef.current?.setClipPlane(v);
  }, []);

  const handleReset = () => {
    setStage('upload');
    setSlicePreview(null);
    setArticles([]);
    setMeshReady(false);
    setClipValue(1);
    setTissues({ vessels: true, tumor: true, bone: true });
    setScanType('abdomen');
    setSidebarOpen(false);
    setErrorMsg('');
    setInfoMsg('');
  };

  const isViewer = stage === 'viewer';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: '100vw', overflow: 'hidden' }}>
      <div className="bg-animated" />
      <div className="bg-grid" />

      {/* ── Header ── */}
      <header style={{
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(6,182,212,0.1)',
        backdropFilter: 'blur(12px)',
        background: 'rgba(5,8,16,0.9)',
        position: 'sticky', top: 0, zIndex: 100,
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 9,
            background: 'linear-gradient(135deg,#06b6d4,#7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(6,182,212,0.35)',
          }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="gradient-text" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>VascuAR</h1>
            <p style={{ fontSize: 10, color: '#475569', marginTop: 1, whiteSpace: 'nowrap' }}>AR Surgical Planning</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <PrivacyBadge />
          {isViewer && (
            <>
              <button className="btn-ghost" onClick={() => setSidebarOpen(o => !o)} style={{ padding: '8px 12px' }} aria-label="Controls">⚙</button>
              <button className="btn-ghost" onClick={handleReset} id="reset-btn" style={{ padding: '8px 12px' }}>↩ New Scan</button>
            </>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* Upload / Processing */}
        {!isViewer && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '24px 16px', gap: 20, overflowY: 'auto',
          }}>
            <div style={{ textAlign: 'center', maxWidth: 520 }}>
              <h2 className="gradient-text" style={{ fontSize: 'clamp(24px, 6vw, 40px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 10 }}>
                Upload a CT scan.<br />See it in 3D.
              </h2>
              <p style={{ color: '#64748b', fontSize: 'clamp(13px, 3.5vw, 15px)', lineHeight: 1.7 }}>
                Drop any DICOM file — VascuAR extracts vessels, tumors, and bone directly in your browser. For best results, upload a <strong style={{ color: '#94a3b8' }}>multi-slice CT series</strong>.
              </p>
            </div>

            {stage === 'upload' && (
              <>
                {/* ── Scan type selector ── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>Scan Type</span>
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    {SCAN_TYPES.map(({ value, label, hint }) => {
                      const active = scanType === value;
                      return (
                        <button
                          key={value}
                          id={`scan-type-${value}`}
                          onClick={() => setScanType(value)}
                          title={hint}
                          style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: 4, padding: '10px 6px', borderRadius: 10,
                            border: active ? '1.5px solid #06b6d4' : '1.5px solid rgba(255,255,255,0.07)',
                            background: active
                              ? 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(124,58,237,0.12))'
                              : 'rgba(255,255,255,0.03)',
                            color: active ? '#e2e8f0' : '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: active ? '0 0 12px rgba(6,182,212,0.2)' : 'none',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: active ? 700 : 400 }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 11, color: '#334155' }}>
                    {SCAN_TYPES.find(t => t.value === scanType)?.hint}
                  </span>
                </div>

                <div style={{ width: '100%', maxWidth: 480 }}>
                  <UploadZone onFiles={handleFiles} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#334155', fontSize: 13 }}>— or try the built-in demo —</span>
                  <button className="btn-demo" id="demo-mode-btn" onClick={handleDemo}>
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Load Demo Phantom (no file needed)
                  </button>
                  <p style={{ fontSize: 12, color: '#334155', textAlign: 'center', maxWidth: 360 }}>
                    Synthetic abdominal CT with aorta, renal vessels & tumor nodules
                  </p>
                </div>

                {/* Error */}
                {errorMsg && (
                  <div className="animate-fade-in" style={{
                    padding: '12px 16px', borderRadius: 8, maxWidth: 460, width: '100%',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#fca5a5', fontSize: 13,
                  }}>⚠ {errorMsg}</div>
                )}

                {slicePreview && <SlicePreview imageData={slicePreview} label={sliceLabel} />}
              </>
            )}

            {stage === 'processing' && (
              <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {slicePreview && <SlicePreview imageData={slicePreview} label={sliceLabel} />}
                <div className="glass" style={{ padding: 20 }}>
                  <ProgressOverlay progress={progress} label={progressLabel} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3D Viewer (always mounted) ── */}
        <div style={{
          position: isViewer ? 'relative' : 'absolute',
          inset: isViewer ? 'auto' : 0,
          flex: isViewer ? 1 : 'none',
          width: '100%', height: '100%',
          visibility: isViewer ? 'visible' : 'hidden',
          pointerEvents: isViewer ? 'auto' : 'none',
          display: isViewer ? 'flex' : 'block',
          flexDirection: 'column',
        }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>

            <BabylonCanvas ref={sceneRef} />

            {/* Info banner for single-slice files */}
            {isViewer && infoMsg && (
              <div className="animate-fade-in" style={{
                position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                zIndex: 20, maxWidth: 480, width: 'calc(100% - 32px)',
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                color: '#fde68a', fontSize: 12, lineHeight: 1.5,
                backdropFilter: 'blur(8px)',
              }}>
                ⚠ {infoMsg}
              </div>
            )}

            {/* DICOM slice thumbnail */}
            {isViewer && slicePreview && (
              <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
                <SlicePreview imageData={slicePreview} label={sliceLabel} compact />
              </div>
            )}

            {/* AR badge — bottom center */}
            {isViewer && (
              <div style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10,
              }}>
                <ARButton disabled={!meshReady} />
              </div>
            )}
          </div>

          {/* Sidebar backdrop */}
          {isViewer && sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 25 }}
            />
          )}

          {/* Slide-up control panel */}
          {isViewer && (
            <div style={{
              position: 'absolute',
              bottom: sidebarOpen ? 0 : -560,
              left: 0, right: 0,
              transition: 'bottom 0.35s cubic-bezier(0.32,0.72,0,1)',
              zIndex: 30,
              background: 'rgba(5,8,16,0.97)',
              backdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(6,182,212,0.15)',
              borderRadius: '18px 18px 0 0',
              padding: '16px 20px 48px',
              maxHeight: '75dvh',
              overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
              </div>
              <p style={{ color: '#06b6d4', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                3D Controls
              </p>
              <ControlPanel
                tissues={tissues}
                onToggle={toggleTissue}
                clipValue={clipValue}
                onClip={handleClip}
                disabled={!meshReady}
              />
              <div style={{ marginTop: 20 }}>
                <PubMedSidebar articles={articles} loading={pubLoading} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(6,182,212,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(5,8,16,0.6)',
        flexWrap: 'wrap', gap: 4,
      }}>
        <span style={{ fontSize: 10, color: '#334155' }}>VascuAR · Hack for Health 2026 · Chattogram</span>
        <span style={{ fontSize: 10, color: '#334155' }}>Babylon.js · 100% client-side</span>
      </footer>
    </div>
  );
}
