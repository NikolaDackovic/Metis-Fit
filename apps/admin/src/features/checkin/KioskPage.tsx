import type { KioskFeedItemDto, KioskTokenDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Maximize2, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { GymOrPlatformMark } from '@/layouts/BrandMark';
import { api } from '@/lib/api';

/**
 * F13-6 "Entry screen": a tablet at the door shows the gym's code; members scan it with the app
 * and get in when their membership is valid. The code changes every few seconds (valid 30 s), so a
 * photo of it cannot be used later. The latest scans greet the member by first name.
 */
export function KioskPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const terminalId = /^[a-z0-9-]{2,40}$/.test(params.get('door') ?? '')
    ? params.get('door')!
    : 'door-1';
  const code = useQuery({
    queryKey: ['kiosk-token', terminalId],
    queryFn: () => api.get<KioskTokenDto>('/admin/access/kiosk-token', { terminalId }),
    refetchInterval: (q) => (q.state.data?.refreshInSec ?? 15) * 1000,
    refetchIntervalInBackground: true,
    gcTime: 0,
  });
  const feed = useQuery({
    queryKey: ['kiosk-feed', terminalId],
    queryFn: () => api.get<KioskFeedItemDto[]>('/admin/access/kiosk-feed', { terminalId }),
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
  });
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!code.data) return;
    void QRCode.toDataURL(code.data.token, {
      margin: 1,
      width: 720,
      errorCorrectionLevel: 'M',
    }).then(setSrc);
  }, [code.data]);
  // Show a scan for 6 seconds after it happened.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const latest = useMemo(
    () => feed.data?.find((f) => now - Date.parse(f.occurredAt) < 6000) ?? null,
    [feed.data, now],
  );

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg-base px-6 py-10 text-center">
      <button
        type="button"
        onClick={() => void document.documentElement.requestFullscreen?.()}
        className="absolute end-4 top-4 inline-flex size-10 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-surface2"
        aria-label={t('admin.kiosk.fullscreen')}
        title={t('admin.kiosk.fullscreen')}
      >
        <Maximize2 className="size-5" />
      </button>
      <GymOrPlatformMark className="h-12 w-auto" />
      {latest ? (
        <div
          role="status"
          className={`flex w-full max-w-xl flex-col items-center gap-4 rounded-md px-8 py-12 ${
            latest.result === 'granted' ? 'bg-status-success/15' : 'bg-status-danger/15'
          }`}
        >
          {latest.result === 'granted' ? (
            <CheckCircle2 className="size-24 text-status-success" aria-hidden />
          ) : (
            <XCircle className="size-24 text-status-danger" aria-hidden />
          )}
          <p className="font-display text-4xl uppercase">
            {latest.result === 'granted'
              ? t('admin.kiosk.welcome', { name: latest.firstName })
              : t('admin.kiosk.denied', { name: latest.firstName })}
          </p>
          {latest.result === 'denied' && (
            <p className="text-lg text-text-secondary">
              {t(`admin.attendance.reasons.${latest.reasonCode}`, {
                defaultValue: latest.reasonCode,
              })}
            </p>
          )}
        </div>
      ) : (
        <>
          <h1 className="font-display text-3xl uppercase md:text-4xl">{t('admin.kiosk.title')}</h1>
          <div className="rounded-lg bg-white p-6 shadow-2xl">
            {src ? (
              <img
                src={src}
                alt={t('admin.kiosk.qr_alt')}
                className="size-[min(70vw,60vh)]"
                draggable={false}
              />
            ) : (
              <div className="size-[min(70vw,60vh)] animate-pulse bg-neutral-200" />
            )}
          </div>
          <p className="max-w-xl text-lg text-text-secondary">{t('admin.kiosk.hint')}</p>
        </>
      )}
      {code.isError && <p className="text-status-danger">{t('admin.kiosk.offline')}</p>}
    </div>
  );
}
