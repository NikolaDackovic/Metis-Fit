import { router, Tabs } from 'expo-router';
import {
  BriefcaseBusiness,
  Building2,
  Dumbbell,
  LayoutGrid,
  HeartPulse,
  House,
  QrCode,
  UserRound,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { guideSeen } from '@/lib/guide';
import { useIsTrainer } from '@/lib/trainer';
import { processPendingJoin } from '@/lib/join';
import { useMe } from '@/lib/queries';
import { registerForPush, usePushNavigation } from '@/lib/push';
import { color, fonts } from '@/theme';

/**
 * Bottom navigation with the entry QR exactly in the middle:
 * Home · Training · Health · [QR] · Club (Work for trainers) · Profile · More.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Signed in from here on: register this phone for push (no-op on web / without EAS project),
  // and turn the sign-up details into the member profile.
  useEffect(() => {
    void registerForPush();
    void processPendingJoin().then((created) => {
      if (created) void qc.invalidateQueries({ queryKey: ['me'] });
    });
  }, [qc]);
  usePushNavigation();
  // F15-1: the app guide once per account on this device (later from Profile).
  const userId = useMe().data?.id;
  useEffect(() => {
    if (!userId) return;
    void guideSeen(userId).then((seen) => {
      if (!seen) router.push('/guide');
    });
  }, [userId]);
  // F14-1: trainers get a "Work" tab instead of "Club" (Club moves to More).
  const isTrainer = useIsTrainer();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg.base },
        tabBarStyle: {
          backgroundColor: color.bg.surface,
          borderTopColor: color.border.subtle,
          height: 64,
          paddingTop: 6,
        },
        tabBarActiveTintColor: color.text.primary,
        tabBarInactiveTintColor: color.text.secondary,
        // Seven places on a 375 px phone: labels always under the icons, never cut off.
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10 },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('app.tabs.home'),
          tabBarIcon: ({ focused, size }) => (
            <House size={size} color={focused ? color.accent[400] : color.text.secondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: t('app.tabs.training'),
          tabBarIcon: ({ focused, size }) => (
            <Dumbbell size={size} color={focused ? color.accent[400] : color.text.secondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: t('app.tabs.health'),
          tabBarIcon: ({ focused, size }) => (
            <HeartPulse size={size} color={focused ? color.accent[400] : color.text.secondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: t('app.tabs.qr'),
          tabBarAccessibilityLabel: t('app.tabs.qr_label'),
          // The entry QR is the most used action: a raised button in the middle of the bar.
          tabBarButton: () => (
            <View style={styles.qrSlot}>
              <Pressable
                onPress={() => router.push('/card')}
                accessibilityRole="button"
                accessibilityLabel={t('app.tabs.qr_label')}
                style={({ pressed }) => [styles.qr, pressed && { opacity: 0.85 }]}
              >
                <QrCode size={28} color={color.onAccent} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          href: isTrainer ? undefined : null,
          title: t('app.tabs.coach'),
          tabBarIcon: ({ focused, size }) => (
            <BriefcaseBusiness
              size={size}
              color={focused ? color.accent[400] : color.text.secondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="club"
        options={{
          href: isTrainer ? null : undefined,
          title: t('app.tabs.club'),
          tabBarIcon: ({ focused, size }) => (
            <Building2 size={size} color={focused ? color.accent[400] : color.text.secondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t('app.tabs.profile'),
          // Profile is its own screen (settings, account); the tab just opens it.
          tabBarButton: ({ style, children }) => (
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="link"
              accessibilityLabel={t('app.tabs.profile')}
              style={style}
            >
              {children}
            </Pressable>
          ),
          tabBarIcon: ({ size }) => <UserRound size={size} color={color.text.secondary} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('app.tabs.more'),
          tabBarIcon: ({ focused, size }) => (
            <LayoutGrid size={size} color={focused ? color.accent[400] : color.text.secondary} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  qrSlot: { flex: 1, alignItems: 'center' },
  qr: {
    width: 58,
    height: 58,
    marginTop: -20,
    borderRadius: 29,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.bg.base,
    shadowColor: color.accent[500],
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
