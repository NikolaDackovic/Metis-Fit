import { LOCALE_INFO, type SupportedLocale } from '@grit/translations';
import { Check, Languages, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { APP_LOCALES, setAppLocale } from '@/lib/i18n';
import { color, fonts, radius, type } from '@/theme';

/** Flag drawn from shared SVG shapes (flag emoji do not render on Windows web). */
export function Flag({ locale, size = 24 }: { locale: SupportedLocale; size?: number }) {
  return (
    <View style={[styles.flag, { width: size, height: (size * 2) / 3 }]}>
      <Svg width={size} height={(size * 2) / 3} viewBox="0 0 30 20">
        {LOCALE_INFO[locale].flag.map((s, i) => (
          <Path key={i} d={s.d} fill={s.fill} />
        ))}
      </Svg>
    </View>
  );
}

function Grid({ onPicked }: { onPicked?: () => void }) {
  const { i18n, t } = useTranslation();
  return (
    <View
      style={styles.grid}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('admin.nav.language')}
    >
      {APP_LOCALES.map((l) => {
        const active = i18n.language === l.code;
        return (
          <Pressable
            key={l.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={l.label}
            onPress={() => {
              void setAppLocale(i18n, l.code);
              onPicked?.();
            }}
            style={({ pressed }) => [
              styles.cell,
              active && styles.active,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Flag locale={l.code} />
            <Text style={[styles.name, active && { color: color.text.primary }]} numberOfLines={1}>
              {l.label}
            </Text>
            {active && <Check size={16} color={color.accent[400]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Language choice with flags and names. Full: a grid (Settings). `compact`: a small button with
 * the current flag that opens the same grid (sign-in screen, table ordering).
 */
export function LanguagePicker({ compact, row }: { compact?: boolean; row?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!compact && !row) return <Grid />;
  const code: SupportedLocale = APP_LOCALES.find((l) => l.code === i18n.language)?.code ?? 'sr';
  return (
    <>
      {row ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('admin.nav.language')}
          style={styles.row}
        >
          <View style={styles.rowIcon}>
            <Languages size={18} color={color.accent[400]} />
          </View>
          <Text style={[type.body, { flex: 1 }]}>{t('admin.nav.language')}</Text>
          <Flag locale={code} size={20} />
          <Text style={styles.code}>{APP_LOCALES.find((x) => x.code === code)?.label}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('admin.nav.language')}
          style={styles.compact}
          hitSlop={6}
        >
          <Flag locale={code} size={20} />
          <Text style={styles.code}>{code.toUpperCase()}</Text>
        </Pressable>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetTop}>
              <Text style={type.h3}>{t('admin.nav.language')}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                hitSlop={8}
              >
                <X size={22} color={color.text.primary} />
              </Pressable>
            </View>
            <ScrollView>
              <Grid onPicked={() => setOpen(false)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flag: {
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
  },
  active: { borderColor: color.accent[500], backgroundColor: color.accent.tint },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: color.text.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.sm,
  },
  code: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.primary },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    maxHeight: '80%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
