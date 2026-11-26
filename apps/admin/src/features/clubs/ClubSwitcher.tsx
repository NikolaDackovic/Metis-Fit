import { Clock, Plus } from 'lucide-react';
import { ClubMark } from '@/layouts/BrandMark';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { currentClub, staffClubs, switchClub, useMyClubs } from '@/lib/current-club';

/** The gym in use: from the X-Club selection, otherwise the first gym in the list (default). */
export function useActiveClub() {
  const clubs = useMyClubs();
  const slug = currentClub();
  const list = staffClubs(clubs.data);
  return list.find((c) => c.slug === slug) ?? list[0] ?? null;
}

/**
 * Gym picker in the sidebar (F12-5 basics): shown when the person works in more than one gym,
 * plus a link to open a new gym.
 */
export function ClubSwitcher() {
  const { t } = useTranslation();
  const clubs = useMyClubs();
  const list = staffClubs(clubs.data);
  const active = useActiveClub();
  if (!active) return null;
  return (
    <div className="hidden flex-col gap-1.5 px-3 pb-2 lg:flex">
      {list.length > 1 ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-wider text-text-muted uppercase">
            {t('admin.clubs.gym')}
          </span>
          <select
            className="h-9 w-full rounded-sm border border-border-subtle bg-bg-surface2 px-2 text-sm"
            value={active.slug}
            onChange={(e) => switchClub(e.target.value)}
          >
            {list.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
                {c.status === 'pending' ? ` (${t('admin.clubs.pending_short')})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="flex items-center gap-2 truncate text-xs text-text-secondary">
          <span className="flex h-6 max-w-20 shrink-0 items-center">
            <ClubMark className="h-full w-auto max-w-20 object-contain" />
          </span>
          <span className="truncate font-semibold text-text-primary">{active.name}</span>
        </p>
      )}
      <Link
        to="/open-gym"
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
      >
        <Plus className="size-3.5" /> {t('admin.clubs.open_new')}
      </Link>
    </div>
  );
}

/** Banner while the gym waits for the platform's approval. */
export function PendingBanner() {
  const { t } = useTranslation();
  const active = useActiveClub();
  if (active?.status !== 'pending') return null;
  return (
    <p className="mb-4 flex items-start gap-2 rounded-sm border border-status-warning/50 bg-status-warning/10 px-4 py-3 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-status-warning" />
      {t('admin.clubs.pending_banner', { name: active.name })}
    </p>
  );
}
