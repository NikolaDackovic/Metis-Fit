import { scheme } from '@/lib/brand-boot';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import { Syncopate_700Bold } from '@expo-google-fonts/syncopate';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import type { i18n as I18n } from 'i18next';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { initAuth, useAuth } from '@/lib/auth';
import { NewPasswordScreen } from '@/components/auth/NewPasswordScreen';
import { applyWebHead } from '@/lib/web-head';

applyWebHead();
import { rememberBrandColors } from '@/lib/brand-boot';
import { setupI18n } from '@/lib/i18n';
import { clubShortName, useClub } from '@/lib/queries';
import { useWorkout } from '@/lib/workout-store';
import { setClubName } from '@grit/translations';
import { useTranslation } from 'react-i18next';
import { OfflineBanner } from '@/components/OfflineBanner';
import { color } from '@/theme';
import { loadSelectedClub, onClubChange } from '@/lib/club-select';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    // Without internet an action fails at once with a clear message. It is never queued and
    // sent later (a booking must not appear or happen behind the member's back).
    mutations: { networkMode: 'always' },
  },
});

/** Keeps {{club}} in every text equal to the club name set in the admin. */
function ClubName() {
  const club = useClub();
  const { i18n } = useTranslation();
  const name = clubShortName(club.data);
  useEffect(() => {
    setClubName(i18n, name);
    void i18n.changeLanguage(i18n.language);
  }, [i18n, name]);
  // Club colors: saved for the next start (styles are created once); the web reloads now.
  const accent = club.data?.info.color_accent;
  const background = club.data?.info.color_background;
  useEffect(() => {
    if (!club.data) return;
    const changed = rememberBrandColors({
      accent: typeof accent === 'string' ? accent : undefined,
      background: typeof background === 'string' ? background : undefined,
    });
    if (changed && Platform.OS === 'web') window.location.reload();
  }, [club.data, accent, background]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Syncopate_700Bold,
  });
  const [i18n, setI18n] = useState<I18n | null>(null);
  const status = useAuth((s) => s.status);
  const recovery = useAuth((s) => s.recovery);
  const [clubLoaded, setClubLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([
      setupI18n().then(setI18n),
      initAuth(),
      loadSelectedClub().then(() => setClubLoaded(true)),
    ]);
  }, []);
  // Changing gym: nothing cached from the previous gym may stay on screen.
  useEffect(() => onClubChange(() => queryClient.clear()), []);

  const ready = fontsLoaded && i18n !== null && status !== 'loading' && clubLoaded;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Signing out wipes every cached member query.
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status]);

  // Upload workouts recorded offline: at sign-in and whenever the app comes back to the foreground.
  useEffect(() => {
    if (status !== 'signedIn') return;
    void useWorkout.getState().sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void useWorkout.getState().sync();
    });
    return () => sub.remove();
  }, [status]);

  if (!ready || !i18n) return null;
  // Opened from a "reset password" email: the new password comes before anything else.
  if (recovery && status === 'signedIn')
    return (
      <I18nextProvider i18n={i18n}>
        <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
        <NewPasswordScreen />
      </I18nextProvider>
    );

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ClubName />
        <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.base } }}
        >
          <Stack.Protected guard={status === 'signedIn'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="equipment/[id]" />
            <Stack.Screen name="trainers" />
            <Stack.Screen name="gyms" />
            <Stack.Screen name="membership" />
            <Stack.Screen name="explore" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="pt-request" />
            <Stack.Screen name="locker" />
            <Stack.Screen name="nutrition" />
            <Stack.Screen name="food-log" />
            <Stack.Screen name="food-add" />
            <Stack.Screen name="food-new" />
            <Stack.Screen name="food-scan" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="today" />
            <Stack.Screen name="activities" />
            <Stack.Screen name="cafe" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="join" />
            <Stack.Screen name="renew" />
            <Stack.Screen name="scan" />
            <Stack.Screen name="coach/class/[id]" />
            <Stack.Screen name="coach/client/[id]" />
            <Stack.Screen name="coach/plan/[id]" />
            <Stack.Screen name="coach/chat/[id]" />
            <Stack.Screen name="coach/availability" />
            <Stack.Screen name="trainer-slots" />
            <Stack.Screen name="calendar" />
            <Stack.Screen name="appearance" />
            <Stack.Screen name="change-password" />
            <Stack.Screen
              name="mode"
              options={{
                presentation: 'fullScreenModal',
                animation: 'fade',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="progress-photos" />
            <Stack.Screen name="legal/[doc]" />
            <Stack.Screen
              name="guide"
              options={{
                presentation: 'fullScreenModal',
                animation: 'fade',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="messages/index" />
            <Stack.Screen name="messages/[id]" />
            <Stack.Screen name="pause" />
            <Stack.Screen name="delete-account" />
            <Stack.Screen
              name="workout/index"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen name="workout/[id]" />
            <Stack.Screen name="exercises/index" />
            <Stack.Screen name="exercises/[id]" />
            <Stack.Screen name="link" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="card"
              options={{ presentation: 'fullScreenModal', animation: 'fade' }}
            />
          </Stack.Protected>
          <Stack.Protected guard={status !== 'signedIn'}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          {/* Table QR ordering: open to guests without an account. */}
          <Stack.Screen name="order/[code]" />
        </Stack>
        <OfflineBanner />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
