import { router, type Href } from 'expo-router';
import {
  BriefcaseBusiness,
  Building2,
  Dumbbell,
  LayoutGrid,
  HeartPulse,
  House,
  QrCode,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsTrainer } from '@/lib/trainer';
import { color, fonts } from '@/theme';

/**
 * The bottom bar on screens opened from a tab (map, café, notifications...): the same places as
 * the tab bar, so moving around never needs several "back" taps.
 */
export function SubNav() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isTrainer = useIsTrainer();
  const items: Array<{ key: string; label: string; icon: LucideIcon; href: Href }> = [
    { key: 'home', label: t('app.tabs.home'), icon: House, href: '/(tabs)' },
    { key: 'training', label: t('app.tabs.training'), icon: Dumbbell, href: '/(tabs)/classes' },
    { key: 'health', label: t('app.tabs.health'), icon: HeartPulse, href: '/(tabs)/health' },
    { key: 'qr', label: t('app.tabs.qr'), icon: QrCode, href: '/card' },
    isTrainer
      ? { key: 'coach', label: t('app.tabs.coach'), icon: BriefcaseBusiness, href: '/(tabs)/coach' }
      : { key: 'club', label: t('app.tabs.club'), icon: Building2, href: '/(tabs)/club' },
    { key: 'profile', label: t('app.tabs.profile'), icon: UserRound, href: '/profile' },
    { key: 'more', label: t('app.tabs.more'), icon: LayoutGrid, href: '/(tabs)/more' },
  ];
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {items.map(({ key, label, icon: Icon, href }) =>
        key === 'qr' ? (
          <View key={key} style={styles.qrSlot}>
            <Pressable
              onPress={() => router.push(href)}
              accessibilityRole="button"
              accessibilityLabel={t('app.tabs.qr_label')}
              style={({ pressed }) => [styles.qr, pressed && { opacity: 0.85 }]}
            >
              <QrCode size={26} color={color.onAccent} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            key={key}
            onPress={() => router.navigate(href)}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          >
            <Icon size={22} color={color.text.secondary} />
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bg.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
    paddingTop: 6,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 10, color: color.text.secondary },
  qrSlot: { flex: 1, alignItems: 'center' },
  qr: {
    width: 52,
    height: 52,
    marginTop: -18,
    borderRadius: 26,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.bg.base,
  },
});
