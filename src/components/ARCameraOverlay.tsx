import { useEffect, useRef } from 'react';

interface Props {
  onError: (msg: string) => void;
}

/**
 * ARCameraOverlay
 * Displays the device camera as a fullscreen background using getUserMedia.
 * Works on ALL browsers/devices (desktop Chrome, Android Chrome, iOS Safari).
 * The Babylon.js canvas is layered on top with a transparent background.
 */
export function ARCameraOverlay({ onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        // Prefer back camera on mobile; fall back to any camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Camera access denied');
      }
    };

    start();

    return () => {
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [onError]);

  return (
    <video
      ref={videoRef}
      id="ar-camera-feed"
      muted
      playsInline
      autoPlay
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
        background: '#000',
      }}
    />
  );
}
