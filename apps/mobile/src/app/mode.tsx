import { router } from 'expo-router';
import { BriefcaseBusiness, Check, Dumbbell, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformWordmark } from '@/components/PlatformWordmark';
import { setAppMode, useAppMode, type AppMode } from '@/lib/app-mode';
import { useMe } from '@/lib/queries';
import { color, fonts, MAX_CONTENT_WIDTH, radius, type } from '@/theme';

/** Trainers: work or train? Asked once after the first sign-in, changeable at any time. */
export default function ModeScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const { mode, chosen } = useAppMode();
  const pick = async (m: AppMode) => {
    if (me.data?.id) await setAppMode(me.data.id, m);
    router.replace(m === 'coach' ? '/coach' : '/');
  };
  const Option = ({
    value,
    icon: Icon,
    title,
    text,
  }: {
    value: AppMode;
    icon: LucideIcon;
    title: string;
    text: string;
  }) => {
    const active = chosen && mode === value;
    return (
      <Pressable
        onPress={() => void pick(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.option,
          active && styles.optionActive,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.icon}>
          <Icon size={26} color={color.accent[400]} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h3}>{title}</Text>
          <Text style={type.bodySm}>{text}</Text>
        </View>
        {active && <Check size={20} color={color.accent[400]} />}
      </Pressable>
    );
  };
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <PlatformWordmark width={210} />
          <Text style={[type.h1, { textAlign: 'center' }]}>{t('app.mode.title')}</Text>
          <Text style={[type.bodySm, { textAlign: 'center' }]}>{t('app.mode.subtitle')}</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Option
            value="coach"
            icon={BriefcaseBusiness}
            title={t('app.mode.coach')}
            text={t('app.mode.coach_text')}
          />
          <Option
            value="member"
            icon={Dumbbell}
            title={t('app.mode.member')}
            text={t('app.mode.member_text')}
          />
        </View>
        <Text style={[styles.hint]}>{t('app.mode.hint')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.base },
  wrap: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 28,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  optionActive: { borderColor: color.accent[500] },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 13,
    color: color.text.muted,
  },
});
