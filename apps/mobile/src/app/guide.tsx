import { router } from 'expo-router';
import {
  ArrowLeftRight,
  CalendarCheck,
  CircleHelp,
  Droplets,
  Dumbbell,
  Flame,
  Languages,
  Moon,
  QrCode as QrIcon,
  ScanBarcode,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguagePicker } from '@/components/LanguagePicker';
import { PlatformWordmark } from '@/components/PlatformWordmark';
import { QrCode } from '@/components/QrCode';
import { Button } from '@/components/ui';
import { markGuideSeen } from '@/lib/guide';
import { clubShortName, useClub, useMe } from '@/lib/queries';
import { color, fonts, MAX_CONTENT_WIDTH, radius, type } from '@/theme';

const STEPS = ['language', 'welcome', 'entry', 'training', 'health', 'ready'] as const;

function Line({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}>
        <Icon size={18} color={color.accent[400]} />
      </View>
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

/**
 * F15-1: a short walk through the app after the first sign-in (and from Profile at any time).
 * Five steps, skippable; nothing has to be scanned or set up to get in.
 */
export default function GuideScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const club = useClub();
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const done = () => {
    void markGuideSeen(me.data?.id);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const art: Record<(typeof STEPS)[number], ReactNode> = {
    language: (
      <View style={{ alignSelf: 'stretch', gap: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <Languages size={40} color={color.accent[400]} />
        </View>
        <LanguagePicker />
      </View>
    ),
    welcome: (
      <View style={{ alignItems: 'center', gap: 22 }}>
        <PlatformWordmark width={240} />
        <View style={styles.chip}>
          <View style={styles.chipBadge}>
            <Text style={styles.chipBadgeText}>
              {clubShortName(club.data).slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={type.h3}>{clubShortName(club.data)}</Text>
        </View>
      </View>
    ),
    entry: (
      <View style={{ alignItems: 'center' }}>
        <View style={styles.qrCard}>
          <QrCode value="metis-fit-guide" size={150} />
        </View>
        <View style={styles.fakeTabs}>
          <View style={styles.fakeQr}>
            <QrIcon size={26} color={color.onAccent} />
          </View>
        </View>
      </View>
    ),
    training: (
      <View style={styles.panel}>
        <Line icon={CalendarCheck} text={t('app.guide.training_1')} />
        <Line icon={UserRound} text={t('app.guide.training_2')} />
        <Line icon={Dumbbell} text={t('app.guide.training_3')} />
      </View>
    ),
    health: (
      <View style={styles.panel}>
        <Line icon={Flame} text={t('app.guide.health_1')} />
        <Line icon={ScanBarcode} text={t('app.guide.health_2')} />
        <Line icon={Droplets} text={t('app.guide.health_3')} />
        <Line icon={Moon} text={t('app.guide.health_4')} />
      </View>
    ),
    ready: (
      <View style={styles.panel}>
        <Line icon={QrIcon} text={t('app.guide.ready_1')} />
        <Line icon={ArrowLeftRight} text={t('app.guide.ready_2')} />
        <Line icon={CircleHelp} text={t('app.guide.ready_3')} />
      </View>
    ),
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <View style={styles.top}>
          <View style={styles.bars} accessibilityLabel={`${i + 1} / ${STEPS.length}`}>
            {STEPS.map((s, k) => (
              <View key={s} style={[styles.bar, k <= i && styles.barOn]} />
            ))}
          </View>
          {!last && (
            <Pressable onPress={done} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.skip}>{t('app.guide.skip')}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.center}>{art[step]}</View>

        <View style={styles.texts}>
          <Text style={[type.h1, styles.titleText]}>
            {t(`app.guide.${step}_title`, { name: me.data?.firstName ?? '' })}
          </Text>
          <Text style={[type.body, styles.body]}>{t(`app.guide.${step}_text`)}</Text>
        </View>

        <Button
          label={last ? t('app.guide.start') : t('app.guide.next')}
          onPress={() => (last ? done() : setI(i + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg.base },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 20,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 12, minHeight: 44 },
  bars: { flex: 1, flexDirection: 'row', gap: 6, maxWidth: 220 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.border.strong },
  barOn: { backgroundColor: color.accent[500] },
  skip: {
    marginStart: 'auto',
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: color.text.secondary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  texts: { gap: 10, alignItems: 'center' },
  titleText: { textAlign: 'center' },
  body: { textAlign: 'center', color: color.text.secondary },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  chipBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: { fontFamily: fonts.bold, fontSize: 14, color: color.accent[400] },
  qrCard: { padding: 14, borderRadius: radius.md, backgroundColor: '#fff' },
  fakeTabs: {
    marginTop: 26,
    width: 240,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
    alignItems: 'center',
  },
  fakeQr: {
    marginTop: -22,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent[500],
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  panel: {
    alignSelf: 'stretch',
    gap: 14,
    padding: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.accent.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
