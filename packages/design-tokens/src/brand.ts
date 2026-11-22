import { contrastRatio } from './contrast';

/**
 * Club colors set in the admin (Klub i izgled): from one accent and one background color the
 * whole palette is derived, so every screen stays consistent and readable.
 */
export interface BrandColors {
  accent: string; // #RRGGBB
  background: string; // #RRGGBB, must be dark (the apps are dark themed)
}

export const isHex = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

const toRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
/** Mix with white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return toHex(toRgb(hex).map((c) => c + (target - c) * a));
}

export function luminance(hex: string) {
  return contrastRatio(hex, '#000000') / 21; // monotonic proxy, enough for checks
}

/** Background must stay dark so white text keeps WCAG AA contrast. */
export const isDarkEnough = (hex: string) => contrastRatio('#FFFFFF', hex) >= 7;

export function accentPalette(accent: string) {
  const [r, g, b] = toRgb(accent);
  // Text on accent buttons: whichever of black/white reads better.
  const onAccent =
    contrastRatio('#080808', accent) >= contrastRatio('#FFFFFF', accent) ? '#080808' : '#FFFFFF';
  return {
    500: accent.toUpperCase(),
    400: shade(accent, 0.15), // accent text on dark backgrounds
    600: shade(accent, -0.15), // pressed
    tint: `rgba(${r}, ${g}, ${b}, 0.12)`,
    onAccent,
  };
}

export function backgroundPalette(background: string) {
  return {
    base: background.toUpperCase(),
    surface: shade(background, 0.035),
    surface2: shade(background, 0.065),
    elevated: shade(background, 0.11),
    borderSubtle: shade(background, 0.14),
    borderStrong: shade(background, 0.2),
  };
}

/** CSS variables for the web (admin, site). */
export function brandCssVars(c: Partial<BrandColors>): Record<string, string> {
  const vars: Record<string, string> = {};
  if (isHex(c.accent)) {
    const a = accentPalette(c.accent);
    Object.assign(vars, {
      '--color-accent-400': a[400],
      '--color-accent-500': a[500],
      '--color-accent-600': a[600],
      '--color-accent-tint': a.tint,
      '--color-on-accent': a.onAccent,
    });
  }
  if (isHex(c.background) && isDarkEnough(c.background)) {
    const b = backgroundPalette(c.background);
    Object.assign(vars, {
      '--color-bg-base': b.base,
      '--color-bg-surface': b.surface,
      '--color-bg-surface2': b.surface2,
      '--color-bg-elevated': b.elevated,
      '--color-border-subtle': b.borderSubtle,
      '--color-border-strong': b.borderStrong,
    });
  }
  return vars;
}

type MutableColors = {
  bg: { base: string; surface: string; surface2: string; elevated: string };
  border: { subtle: string; strong: string };
  accent: { 500: string; 400: string; 600: string; tint: string };
  onAccent: string;
};
/**
 * React Native: overwrite the shared `color` object in place before any screen module is
 * evaluated (StyleSheet values are read once), so the whole app picks up the club colors.
 */
export function applyBrandToColors(target: unknown, c: Partial<BrandColors>) {
  const t = target as MutableColors;
  if (isHex(c.accent)) {
    const a = accentPalette(c.accent);
    Object.assign(t.accent, { 500: a[500], 400: a[400], 600: a[600], tint: a.tint });
    t.onAccent = a.onAccent;
  }
  if (isHex(c.background) && isDarkEnough(c.background)) {
    const b = backgroundPalette(c.background);
    Object.assign(t.bg, {
      base: b.base,
      surface: b.surface,
      surface2: b.surface2,
      elevated: b.elevated,
    });
    Object.assign(t.border, { subtle: b.borderSubtle, strong: b.borderStrong });
  }
}
