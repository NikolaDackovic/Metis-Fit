import { brandCssVars } from '@grit/design-tokens';
import { setClubName } from '@grit/translations';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';

export interface PublicClub {
  info: Record<string, unknown>;
  logoUrl: string | null;
  loginImageUrl: string | null;
  isDefault: boolean;
}

/** Public club profile (name, logo, login photo) edited in Klub i izgled. */
export function usePublicClub() {
  return useQuery({
    queryKey: ['public-club'],
    queryFn: () => api.get<PublicClub>('/public/club'),
    staleTime: 5 * 60_000,
  });
}

/** Applies club colors (CSS variables) and keeps {{club}} in every text in sync with the short name. */
export function useClubName() {
  const { i18n } = useTranslation();
  const q = usePublicClub();
  const name = typeof q.data?.info.short_name === 'string' ? q.data.info.short_name : null;
  useEffect(() => {
    setClubName(i18n, name);
    void i18n.changeLanguage(i18n.language); // re-render texts with the new name
  }, [i18n, name]);
  const accent = q.data?.info.color_accent;
  const background = q.data?.info.color_background;
  useEffect(() => {
    const root = document.documentElement;
    const vars = brandCssVars({ accent: accent as string, background: background as string });
    for (const k of [...root.style].filter((x) => x.startsWith('--color-')))
      root.style.removeProperty(k);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }, [accent, background]);
}
