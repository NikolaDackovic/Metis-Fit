import { router } from 'expo-router';
import { BriefcaseBusiness, Dumbbell } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { setAppMode, useAppMode, type AppMode } from '@/lib/app-mode';
import { useMe } from '@/lib/queries';
import { color, fonts } from '@/theme';

/** Trainers only: "Trainer | Member" in one tap (Home and Work headers). */
export function ModeSwitch() {
  const { t } = useTranslation();
  const me = useMe();
  const { mode, isTrainer } = useAppMode();
  if (!isTrainer) return null;
  const go = async (m: AppMode) => {
    if (m === mode || !me.data?.id) return;
    await setAppMode(me.data.id, m);
    router.replace(m === 'coach' ? '/coach' : '/');
  };
  return (
    <View style={styles.wrap} accessibilityRole="tablist" accessibilityLabel={t('app.mode.switch')}>
      {(
        [
          ['coach', BriefcaseBusiness, t('app.mode.coach_short')],
          ['member', Dumbbell, t('app.mode.member_short')],
        ] as const
      ).map(([m, Icon, label]) => {
        const on = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => void go(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.item, on && styles.itemOn]}
          >
            <Icon size={14} color={on ? color.onAccent : color.text.secondary} />
            <Text style={[styles.text, on && { color: color.onAccent }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    backgroundColor: color.bg.surface,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  itemOn: { backgroundColor: color.accent[500] },
  text: { fontFamily: fonts.semibold, fontSize: 13, color: color.text.secondary },
});
