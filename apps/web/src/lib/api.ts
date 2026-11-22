import type { OpeningHour } from './club';

export const API_URL = (import.meta.env.PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(
  /\/$/,
  '',
);
export const APP_URL = (import.meta.env.PUBLIC_MEMBER_APP_URL ?? 'http://localhost:8081').replace(
  /\/$/,
  '',
);

export type ClubData = {
  info: Record<string, unknown>;
  openingHours: OpeningHour[];
  logoUrl: string | null;
  loginImageUrl: string | null;
  photos: Array<{ id: string; url: string; captions: Record<string, string>; sortOrder: number }>;
};

/**
 * Club data at build time, for the page title, meta description and search-engine data.
 * The page loads it again in the browser, so admin changes show without a rebuild.
 * When the API is not reachable during the build, the page still builds with neutral values.
 */
export async function clubAtBuild(locale: string): Promise<ClubData | null> {
  try {
    const res = await fetch(`${API_URL}/public/club?locale=${locale}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data: ClubData }).data;
  } catch {
    return null;
  }
}

export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
