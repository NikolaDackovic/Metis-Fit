import { Check, Moon, Smartphone, Sun, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Screen } from '@/components/ui';
import { setThemePref, themePref, type ThemePref } from '@/lib/brand-boot';
import { color, fonts, radius, type } from '@/theme';

const OPTIONS: Array<{ k: ThemePref; icon: LucideIcon; bg: string; card: string; line: string }> = [
  { k: 'light', icon: Sun, bg: '#F4F4F2', card: '#FFFFFF', line: '#D9D9D5' },
  { k: 'dark', icon: Moon, bg: '#080808', card: '#181818', line: '#2B2B2B' },
  { k: 'system', icon: Smartphone, bg: '#080808', card: '#181818', line: '#2B2B2B' },
];

/** A small picture of a screen in that theme. */
function Preview({
  bg,
  card,
  line,
  half,
}: {
  bg: string;
  card: string;
  line: string;
  half?: boolean;
}) {
  return (
    <View style={[styles.preview, { backgroundColor: bg }]}>
      {half && <View style={[StyleSheet.absoluteFill, styles.halfLight]} />}
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.pCard,
            { backgroundColor: half && i === 0 ? '#FFFFFF' : card, borderColor: line },
          ]}
        >
          <View
            style={[
              styles.pBar,
              { backgroundColor: color.accent[500], width: i === 0 ? '40%' : '30%' },
            ]}
          />
          <View style={[styles.pBar, { backgroundColor: line, width: '70%' }]} />
        </View>
      ))}
    </View>
  );
}

/**
 * F15-3 Appearance (as in GoFitness): Light, Dark or System. The choice is saved on this phone
 * and the app restarts once so every screen uses the new colors.
 */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <BackHeader title={t('app.theme.title')} />
      <Text style={type.bodySm}>{t('app.theme.hint')}</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const on = o.k === themePref;
          return (
            <Pressable
              key={o.k}
              onPress={() => !on && void setThemePref(o.k)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(`app.theme.${o.k}`)}
              style={[styles.option, on && styles.optionOn]}
            >
              <Preview bg={o.bg} card={o.card} line={o.line} half={o.k === 'system'} />
              <View style={styles.label}>
                <o.icon size={16} color={on ? color.accent[400] : color.text.secondary} />
                <Text style={[styles.labelText, on && { color: color.accent[400] }]}>
                  {t(`app.theme.${o.k}`)}
                </Text>
              </View>
              {on && (
                <View style={styles.check}>
                  <Check size={14} color={color.onAccent} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    gap: 10,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  optionOn: { borderColor: color.accent[500] },
  preview: { height: 130, borderRadius: radius.md, padding: 8, gap: 6, overflow: 'hidden' },
  halfLight: { left: '50%', backgroundColor: '#F4F4F2' },
  pCard: { borderRadius: 6, borderWidth: 1, padding: 6, gap: 4 },
  pBar: { height: 4, borderRadius: 2 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 28,
  },
  labelText: { fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  check: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
