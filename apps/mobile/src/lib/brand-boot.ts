import { applyBrandToColors, color, type BrandColors } from '@grit/design-tokens';
import * as SecureStore from 'expo-secure-store';
import { Appearance, Platform } from 'react-native';

/**
 * Runs before any screen is loaded (see index.ts): applies the club colors saved on the last
 * run, so every StyleSheet is created with them. New colors from the admin are saved by
 * `rememberBrandColors` and take effect on the next start (web reloads right away).
 */
export const BRAND_KEY = 'grit.brand_colors';

export const THEME_KEY = 'metis.theme';
export type ThemePref = 'light' | 'dark' | 'system';

function read(key = BRAND_KEY): string | null {
  try {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

/** F15-3 appearance: light, dark (default, the brand look) or the phone's setting. */
export const themePref: ThemePref = (() => {
  const v = read(THEME_KEY);
  return v === 'light' || v === 'system' ? v : 'dark';
})();
export const scheme: 'light' | 'dark' =
  themePref === 'system' ? (Appearance.getColorScheme() === 'light' ? 'light' : 'dark') : themePref;

/** Light palette: same structure as the dark tokens; orange text darker for contrast on white. */
const LIGHT = {
  bg: { base: '#F4F4F2', surface: '#FFFFFF', surface2: '#EFEFEC', elevated: '#FFFFFF' },
  border: { subtle: '#E2E2DE', strong: '#CBCBC6' },
  text: { primary: '#141414', secondary: '#565656', muted: '#8A8A8A' },
  status: {
    success: '#15803D',
    warning: '#A16207',
    danger: '#DC2626',
    neutral: '#565656',
    info: '#2B2B2B',
  },
};
if (scheme === 'light') {
  const c = color as unknown as Record<string, Record<string, string>>;
  Object.assign(c.bg!, LIGHT.bg);
  Object.assign(c.border!, LIGHT.border);
  Object.assign(c.text!, LIGHT.text);
  Object.assign(c.status!, LIGHT.status);
  Object.assign(c.accent!, { 400: '#C5401C', tint: 'rgba(229, 78, 38, 0.10)' });
}

/** Saves the choice and restarts the app so every screen is drawn in the new colors. */
export async function setThemePref(next: ThemePref) {
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(THEME_KEY, next);
    else SecureStore.setItem(THEME_KEY, next);
  } catch {
    return;
  }
  if (Platform.OS === 'web') window.location.reload();
  else {
    const { reloadAppAsync } = await import('expo');
    await reloadAppAsync('theme');
  }
}

export const bootBrand: Partial<BrandColors> = (() => {
  try {
    return JSON.parse(read() ?? '{}') as Partial<BrandColors>;
  } catch {
    return {};
  }
})();
// A club's own background is a dark color: in the light theme only its accent is used.
applyBrandToColors(color, scheme === 'light' ? { accent: bootBrand.accent } : bootBrand);

/** Saves the club colors; returns true when they differ from the ones this run started with. */
export function rememberBrandColors(next: Partial<BrandColors>): boolean {
  const clean = { accent: next.accent ?? undefined, background: next.background ?? undefined };
  const changed = clean.accent !== bootBrand.accent || clean.background !== bootBrand.background;
  if (!changed) return false;
  const value = JSON.stringify(clean);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(BRAND_KEY, value);
    else SecureStore.setItem(BRAND_KEY, value);
  } catch {
    /* not persisted: the default colors stay */
  }
  return true;
}
