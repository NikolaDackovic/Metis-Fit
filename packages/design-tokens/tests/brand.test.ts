import { describe, expect, it } from 'vitest';
import {
  accentPalette,
  applyBrandToColors,
  brandCssVars,
  contrastRatio,
  isDarkEnough,
} from '../src';

describe('club colors', () => {
  it('derives a readable palette from one accent color', () => {
    const p = accentPalette('#E54E26');
    expect(p[500]).toBe('#E54E26');
    expect(contrastRatio(p.onAccent, p[500])).toBeGreaterThanOrEqual(4.5);
    // A dark blue accent gets white labels.
    expect(accentPalette('#1D3A8A').onAccent).toBe('#FFFFFF');
  });

  it('only accepts dark backgrounds and valid hex values', () => {
    expect(isDarkEnough('#080808')).toBe(true);
    expect(isDarkEnough('#F0F0F0')).toBe(false);
    expect(brandCssVars({ background: '#F0F0F0', accent: 'red' })).toEqual({});
    expect(brandCssVars({ accent: '#22AA55' })['--color-accent-500']).toBe('#22AA55');
  });

  it('rewrites the shared color object for the mobile app', () => {
    const c = {
      bg: { base: '', surface: '', surface2: '', elevated: '' },
      border: { subtle: '', strong: '' },
      accent: { 500: '', 400: '', 600: '', tint: '' },
      onAccent: '',
    };
    applyBrandToColors(c, { accent: '#22AA55', background: '#0A0F1A' });
    expect(c.accent[500]).toBe('#22AA55');
    expect(c.bg.base).toBe('#0A0F1A');
    expect(c.bg.surface).not.toBe(c.bg.base);
  });
});
