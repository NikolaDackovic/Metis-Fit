/**
 * GRIT design tokens - single source for web (CSS variables / Tailwind) and React Native.
 * docs/DESIGN_SYSTEM.md explains every value. Components never hard-code colors or spacing.
 */

export const color = {
  bg: {
    base: '#080808',
    surface: '#111111',
    surface2: '#181818',
    elevated: '#222222',
  },
  border: {
    subtle: '#2B2B2B',
    strong: '#3A3A3A',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A0A0A0',
    muted: '#6E6E6E', // decorative / disabled only - fails AA for body text by design
  },
  accent: {
    500: '#E54E26', // official GRIT logo orange (assets/brand/grit-logo-orange.png)
    400: '#EE6A45', // orange TEXT and focus ring on dark backgrounds
    600: '#C5401C', // pressed
    tint: 'rgba(229, 78, 38, 0.12)',
  },
  onAccent: '#080808', // label color on accent buttons (white fails WCAG AA on #E54E26)
  status: {
    success: '#2BD576',
    warning: '#F5B83D',
    danger: '#FF5A4E',
    neutral: '#A0A0A0',
    info: '#D9D9D9',
  },
  qr: { foreground: '#000000', background: '#FFFFFF' },
} as const;

/** 4-pt spacing scale (px / dp). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = { xs: 2, sm: 4, md: 8, lg: 12, full: 9999 } as const;

export const font = {
  display: 'Syncopate', // short uppercase headlines only; Latin only (falls back to body font for Cyrillic)
  body: 'Montserrat',
  arabic: 'IBM Plex Sans Arabic',
} as const;

/** [size, lineHeight, weight] - mobile values; web may scale `display`. */
export const type = {
  display: {
    size: 40,
    lineHeight: 44,
    weight: 700,
    family: 'display',
    uppercase: true,
    letterSpacing: -0.5,
  },
  h1: { size: 28, lineHeight: 34, weight: 700, family: 'body' },
  h2: { size: 22, lineHeight: 28, weight: 700, family: 'body' },
  h3: { size: 18, lineHeight: 24, weight: 600, family: 'body' },
  body: { size: 16, lineHeight: 24, weight: 400, family: 'body' },
  bodySm: { size: 14, lineHeight: 20, weight: 400, family: 'body' },
  label: {
    size: 13,
    lineHeight: 16,
    weight: 600,
    family: 'body',
    uppercase: true,
    letterSpacing: 0.8,
  },
  stat: { size: 32, lineHeight: 36, weight: 700, family: 'body', tabularNums: true },
} as const;

export const motion = {
  fast: { duration: 120, easing: 'cubic-bezier(0, 0, 0.2, 1)' },
  base: { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  slow: { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
} as const;

export const touchTarget = { ios: 44, android: 48, primaryButtonHeight: 52 } as const;

export const breakpoint = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export const tokens = {
  color,
  space,
  radius,
  font,
  type,
  motion,
  touchTarget,
  breakpoint,
} as const;
export type Tokens = typeof tokens;

export { contrastRatio } from './contrast';
export * from './brand';
export * from './platform';
export * from './platform-wordmark';
