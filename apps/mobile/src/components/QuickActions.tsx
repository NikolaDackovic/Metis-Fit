import { router } from 'expo-router';
import { Activity, Coffee, Droplets, Utensils, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, fonts, radius } from '@/theme';

const ACTIONS: Array<{ key: string; icon: LucideIcon; to: string }> = [
  { key: 'today', icon: Droplets, to: '/today' },
  { key: 'activity', icon: Activity, to: '/activities' },
  { key: 'food', icon: Utensils, to: '/food-log' },
  { key: 'cafe', icon: Coffee, to: '/cafe' },
];

/** Shortcuts to everything a member tracks on their own (in and outside the gym). */
export function QuickActions() {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {ACTIONS.map(({ key, icon: Icon, to }) => (
        <Pressable
          key={key}
          onPress={() => router.push(to as never)}
          accessibilityRole="button"
          accessibilityLabel={t(`app.quick.${key}`)}
          style={styles.item}
        >
          <View style={styles.icon}>
            <Icon size={22} color={color.accent[400]} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t(`app.quick.${key}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent.tint,
  },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: color.text.primary },
});
