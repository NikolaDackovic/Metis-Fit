import { describe, expect, it } from 'vitest';
import { color, contrastRatio } from '../src';

const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe('WCAG AA contrast of GRIT tokens (docs/DESIGN_SYSTEM.md §1)', () => {
  const surfaces = [color.bg.base, color.bg.surface, color.bg.surface2];

  it.each(surfaces)('primary and secondary text are AA on %s', (bg) => {
    expect(contrastRatio(color.text.primary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(color.text.secondary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(surfaces)('orange text (accent.400) is AA on %s', (bg) => {
    expect(contrastRatio(color.accent[400], bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('button label on accent is AA', () => {
    expect(contrastRatio(color.onAccent, color.accent[500])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('documents why white is not used on accent buttons (fails AA, passes only large text)', () => {
    const white = contrastRatio('#FFFFFF', color.accent[500]);
    expect(white).toBeLessThan(AA_TEXT);
    expect(white).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(Object.entries(color.status))(
    'status color %s is distinguishable on surface',
    (_name, c) => {
      expect(contrastRatio(c, color.bg.surface)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it('QR has maximum contrast', () => {
    expect(contrastRatio(color.qr.foreground, color.qr.background)).toBe(21);
  });
});
