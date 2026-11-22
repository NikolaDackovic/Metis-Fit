/**
 * The platform brand (F12): the member app, sign-in screens and gyms without their own logo.
 * One place to rename the product (check the trademark before launch).
 */
export const PLATFORM_NAME = 'Metis Fit';

/** Platform orange: a touch brighter than the GRIT accent, made for the glowing mark. */
export const PLATFORM_COLOR = '#FF5A1F';

/**
 * The mark: a forward-leaning "M" with barbell plates on its left (large, medium, collar) and a
 * thin curved cut through the letter for motion. Drawn upright on a 100-high grid, then slanted.
 * The same mark is the app icon; next to it the name is set in Montserrat ExtraBold at the same slant.
 */
export const PLATFORM_MARK = {
  viewBox: '-95 -8 250 116',
  ratio: 250 / 116,
  skewX: -16,
  path: 'M0 100 V0 H36 L66 50 L96 0 H132 V86 Q132 100 118 100 H104 V44 L74 90 H58 L28 44 V86 Q28 100 14 100 Z',
  plates: [
    { x: -27, y: 6, width: 21, height: 88 },
    { x: -50, y: 18, width: 17, height: 64 },
    { x: -64, y: 38, width: 9, height: 24 },
  ],
  plateRadius: 5,
  /** The motion cut (removed from the shape with a mask, so it works on any background). */
  cut: 'M-10 97 Q60 80 150 26',
  cutWidth: 5,
} as const;
