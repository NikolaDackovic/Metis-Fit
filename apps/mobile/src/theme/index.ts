import { color, radius, space } from '@grit/design-tokens';
import { spacing } from '@/lib/rtl';
import { StyleSheet, type TextStyle } from 'react-native';

export { color, radius, space };

/** Font family names registered by useFonts in the root layout. */
export const fonts = {
  display: 'Syncopate_700Bold',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
} as const;

/**
 * Syncopate has no Cyrillic or Arabic glyphs: Russian and Arabic headlines use Montserrat
 * ExtraBold (Arabic letters then come from the system Arabic font).
 * docs/DESIGN_SYSTEM.md §2.
 */
export function displayFont(language: string): string {
  return language === 'ru' || language === 'ar' ? fonts.extrabold : fonts.display;
}

export const type = StyleSheet.create({
  display: { fontSize: 30, lineHeight: 36, color: color.text.primary, textTransform: 'uppercase' },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: color.text.primary },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: color.text.primary },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: color.text.primary },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: color.text.primary },
  bodySm: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: color.text.secondary },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: spacing(0.9),
    textTransform: 'uppercase',
    color: color.text.secondary,
  },
  stat: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    color: color.text.primary,
    fontVariant: ['tabular-nums'],
  },
}) satisfies Record<string, TextStyle>;

/** Content never stretches wider than a comfortable reading width on tablets / web. */
export const MAX_CONTENT_WIDTH = 560;
