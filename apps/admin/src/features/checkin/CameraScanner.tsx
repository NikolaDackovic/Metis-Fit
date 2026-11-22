import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * Camera scanning via the browser's built-in BarcodeDetector (Chrome on Android/macOS/ChromeOS,
 * Edge on some platforms). Only offered where supported - the USB scanner is the primary input.
 */
export function cameraScanSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function CameraScanner({
  onScan,
  paused,
}: {
  onScan: (value: string) => void;
  paused: boolean;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ value: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Latest callback without restarting the camera on every parent render.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          if (!pausedRef.current && video.current.readyState >= 2) {
            const codes = await detector.detect(video.current).catch(() => []);
            const value = codes[0]?.rawValue;
            // Ignore the same code seen again within 3 s (camera keeps seeing it).
            if (value && !(last.current?.value === value && Date.now() - last.current.at < 3000)) {
              last.current = { value, at: Date.now() };
              onScanRef.current(value);
            }
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch {
        setError('admin.checkin.camera_error');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) return <p className="text-sm text-status-danger">{t(error)}</p>;
  return (
    <video
      ref={video}
      muted
      playsInline
      aria-label={t('admin.checkin.camera_on')}
      className="aspect-video w-full rounded-sm border border-border-subtle bg-black object-cover"
    />
  );
}
