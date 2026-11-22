import {
  createI18n,
  isRtl,
  LOCALE_INFO,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@grit/translations';
import { getLocales } from 'expo-localization';
import type { i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import { applyDirection, startupRtl, syncNativeDirection } from './rtl';
import { secureStorage } from './storage';

const KEY = 'grit.locale';

/** Languages offered in the app. Names are endonyms. Arabic switches the layout to right to left. */
export const APP_LOCALES: Array<{ code: SupportedLocale; label: string }> = SUPPORTED_LOCALES.map(
  (code) => ({ code, label: LOCALE_INFO[code].name }),
);

export async function setupI18n(): Promise<i18n> {
  const saved = await secureStorage.getItem(KEY);
  const device = getLocales()[0]?.languageCode ?? 'sr';
  const initial = saved ?? (APP_LOCALES.some((l) => l.code === device) ? device : 'sr');
  const lng = normalizeLocale(initial);
  if (!saved) await secureStorage.setItem(KEY, lng);
  syncNativeDirection(isRtl(lng));
  // Web: the first visit in Arabic (browser language) reloads once with the right direction.
  if (Platform.OS === 'web' && isRtl(lng) !== startupRtl) window.location.reload();
  return createI18n(lng, {}, [initReactI18next]);
}

export async function setAppLocale(instance: i18n, lng: SupportedLocale) {
  await secureStorage.setItem(KEY, lng);
  await instance.changeLanguage(lng);
  // Switching to or from Arabic flips the whole layout, which needs a restart on phones.
  applyDirection(isRtl(lng), {
    title: instance.t('app.language.restart_title'),
    message: instance.t('app.language.restart_text'),
  });
}
