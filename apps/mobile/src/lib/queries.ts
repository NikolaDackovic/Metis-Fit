import { PLATFORM_NAME } from '@grit/design-tokens';
import type { MeDto, MembershipDto, MyPaymentDto, MyVisitDto } from '@grit/validation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useAuth } from './auth';

export function useMe() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeDto>('/me'),
    enabled: status === 'signedIn',
  });
}

export function useMyMemberships() {
  const { i18n } = useTranslation();
  const { data: me } = useMe();
  return useQuery({
    queryKey: ['me', 'memberships', i18n.language],
    queryFn: () => api.get<MembershipDto[]>('/me/memberships', { locale: i18n.language }),
    enabled: Boolean(me?.member),
  });
}

export function useMyPayments() {
  const { i18n } = useTranslation();
  const { data: me } = useMe();
  return useQuery({
    queryKey: ['me', 'payments', i18n.language],
    queryFn: () => api.get<MyPaymentDto[]>('/me/payments', { locale: i18n.language }),
    enabled: Boolean(me?.member),
  });
}

export function useMyVisits() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ['me', 'visits'],
    queryFn: () => api.get<MyVisitDto[]>('/me/visits'),
    enabled: Boolean(me?.member),
  });
}

export interface ClubInfo {
  info: Record<string, unknown>;
  logoUrl: string | null;
  loginImageUrl: string | null;
  /** F12: the original gym (GRIT) keeps its built-in logo. */
  isDefault?: boolean;
  photos: Array<{ id: string; url: string; captions: Record<string, string>; sortOrder: number }>;
  openingHours: Array<{
    weekday: number;
    opensAt: string | null;
    closesAt: string | null;
    isClosed: boolean;
  }>;
}
export function useClub() {
  return useQuery({
    queryKey: ['club'],
    queryFn: () => api.get<ClubInfo>('/public/club'),
    staleTime: 5 * 60_000,
  });
}

/** Rank memberships so the "current" one shown on Home is the most relevant valid one. */
const RANK: Record<string, number> = {
  active: 1,
  expiring_soon: 2,
  paused: 3,
  pending: 4,
  expired: 5,
  cancelled: 6,
};
export function currentMembership(list: MembershipDto[] | undefined): MembershipDto | null {
  if (!list?.length) return null;
  return (
    [...list]
      .filter((m) => m.state !== 'cancelled')
      .sort((a, b) => (RANK[a.displayStatus] ?? 9) - (RANK[b.displayStatus] ?? 9))[0] ?? null
  );
}

/** Short gym name used in texts ("Your GRIT"): short name, else the gym name, else the platform. */
export const clubShortName = (c: ClubInfo | undefined) => {
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return pick(c?.info.short_name) ?? pick(c?.info.name) ?? PLATFORM_NAME;
};
