import {
  createI18n,
  INTL_LOCALE,
  isRtl,
  normalizeLocale,
  type SupportedLocale,
} from '@grit/translations';
import type { i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

const KEY = 'grit.admin.locale';

function storedLocale(): string {
  try {
    return localStorage.getItem(KEY) ?? navigator.language;
  } catch {
    return 'sr';
  }
}

export async function setupI18n(): Promise<i18n> {
  const instance = await createI18n(storedLocale(), {}, [initReactI18next]);
  applyDocumentLocale(instance.language);
  return instance;
}

export function applyDocumentLocale(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = isRtl(lng) ? 'rtl' : 'ltr';
}

export async function changeLocale(instance: i18n, lng: SupportedLocale) {
  await instance.changeLanguage(lng);
  applyDocumentLocale(lng);
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    /* preference not persisted */
  }
}

export const intlLocale = (lng: string) => INTL_LOCALE[normalizeLocale(lng)];
