import { applyBrandToColors, color, type BrandColors } from '@grit/design-tokens';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Runs before any screen is loaded (see index.ts): applies the club colors saved on the last
 * run, so every StyleSheet is created with them. New colors from the admin are saved by
 * `rememberBrandColors` and take effect on the next start (web reloads right away).
 */
export const BRAND_KEY = 'grit.brand_colors';

function read(): string | null {
  try {
    if (Platform.OS === 'web') return window.localStorage.getItem(BRAND_KEY);
    return SecureStore.getItem(BRAND_KEY);
  } catch {
    return null;
  }
}

export const bootBrand: Partial<BrandColors> = (() => {
  try {
    return JSON.parse(read() ?? '{}') as Partial<BrandColors>;
  } catch {
    return {};
  }
})();
applyBrandToColors(color, bootBrand);

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
