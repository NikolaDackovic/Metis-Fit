import type { NotificationDto, NotificationListDto } from '@grit/validation';
import { INTL_LOCALE, normalizeLocale } from '@grit/translations';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';

/** The member's inbox (polled every minute while the app is open). */
export function useNotifications() {
  return useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => api.get<NotificationListDto>('/me/notifications'),
    refetchInterval: 60_000,
  });
}

/** Message text in the reader's language (same templates the server uses for push). */
export function useNotificationText() {
  const { t, i18n } = useTranslation();
  return (n: NotificationDto) => {
    const p: Record<string, unknown> = { ...n.params };
    if (typeof n.params.startsAt === 'string') {
      p.time = new Intl.DateTimeFormat(INTL_LOCALE[normalizeLocale(i18n.language)], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(n.params.startsAt));
    }
    // Calendar days (F13-2 pause from / to / new end date) in the reader's format.
    const day = new Intl.DateTimeFormat(INTL_LOCALE[normalizeLocale(i18n.language)], {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    for (const k of ['from', 'to', 'endDate']) {
      const v = n.params[k];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
        p[k] = day.format(new Date(`${v}T00:00:00Z`));
    }
    return {
      title: t(`app.notify.${n.kind}.title`, { ...p, interpolation: { escapeValue: false } }),
      body: t(`app.notify.${n.kind}.body`, { ...p, interpolation: { escapeValue: false } }),
    };
  };
}
