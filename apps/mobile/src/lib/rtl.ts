import { Alert, DevSettings, I18nManager, Platform } from 'react-native';

/**
 * Right-to-left layout (Arabic). On phones the direction is a native setting that only takes
 * effect after a restart, so it is decided once at startup:
 *  - native: `I18nManager.isRTL` (persisted by `forceRTL`)
 *  - web: the saved language; the document `dir` makes flex rows and text run right to left.
 */
const LOCALE_KEY = 'grit.locale';

function webSavedRtl(): boolean {
  try {
    return window.localStorage.getItem(LOCALE_KEY) === 'ar';
  } catch {
    return false;
  }
}

export const startupRtl: boolean = Platform.OS === 'web' ? webSavedRtl() : I18nManager.isRTL;

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = startupRtl ? 'rtl' : 'ltr';
}

/** Arrows and chevrons point the other way in RTL. */
export const dirIcon = startupRtl ? { transform: [{ scaleX: -1 }] } : undefined;

/** Letter spacing breaks joined Arabic letters: use none in RTL. */
export const spacing = (value: number) => (startupRtl ? 0 : value);

/**
 * Applies the layout direction for a language. Returns true when the app must restart
 * (direction changed); the caller has already saved the language.
 */
export function applyDirection(rtl: boolean, restartTexts: { title: string; message: string }) {
  if (rtl === startupRtl) return false;
  if (Platform.OS === 'web') {
    window.location.reload();
    return true;
  }
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (__DEV__) DevSettings.reload();
  else Alert.alert(restartTexts.title, restartTexts.message);
  return true;
}

/** Keeps the native direction in line with the saved language (e.g. after reinstalling). */
export function syncNativeDirection(rtl: boolean) {
  if (Platform.OS === 'web' || I18nManager.isRTL === rtl) return;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}
