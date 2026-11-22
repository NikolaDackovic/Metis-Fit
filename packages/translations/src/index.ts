import i18next, { type i18n, type InitOptions } from 'i18next';
import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import sr from './locales/sr.json';
import zh from './locales/zh.json';

/**
 * sr = Serbian (Latin, default), en = English, ru = Russian (owners), ar = Arabic (right to left).
 * Arabic covers everything members see (app, errors, validation); admin screens fall back to
 * English until the staff texts are translated (docs/DECISIONS.md).
 */
export const SUPPORTED_LOCALES = ['sr', 'en', 'ru', 'ar', 'es', 'de', 'fr', 'it', 'zh'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'sr';
export const RTL_LOCALES: ReadonlySet<SupportedLocale> = new Set(['ar']);

export const resources = {
  sr: { translation: sr },
  ru: { translation: ru },
  en: { translation: en },
  ar: { translation: ar },
  es: { translation: es },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  zh: { translation: zh },
} as const;

/**
 * Language list for pickers: the name in its own language and a flag. Flags are drawn as small
 * SVG shapes (viewBox 30x20) so they look the same on Windows, where flag emoji do not render.
 */
export type FlagShape = { d: string; fill: string };
const h3 = (a: string, b: string, c: string): FlagShape[] => [
  { d: 'M0 0h30v6.67H0z', fill: a },
  { d: 'M0 6.67h30v6.67H0z', fill: b },
  { d: 'M0 13.33h30V20H0z', fill: c },
];
const v3 = (a: string, b: string, c: string): FlagShape[] => [
  { d: 'M0 0h10v20H0z', fill: a },
  { d: 'M10 0h10v20H10z', fill: b },
  { d: 'M20 0h10v20H20z', fill: c },
];
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}z`;
}
export const LOCALE_INFO: Record<SupportedLocale, { name: string; flag: FlagShape[] }> = {
  sr: { name: 'Srpski', flag: h3('#C6363C', '#0C4076', '#FFFFFF') },
  en: {
    name: 'English',
    flag: [
      { d: 'M0 0h30v20H0z', fill: '#012169' },
      { d: 'M0 0h3.6L30 17.6V20h-3.6L0 2.4z', fill: '#FFFFFF' },
      { d: 'M30 0v2.4L3.6 20H0v-2.4L26.4 0z', fill: '#FFFFFF' },
      { d: 'M12 0h6v20h-6zM0 7h30v6H0z', fill: '#FFFFFF' },
      { d: 'M13.2 0h3.6v20h-3.6zM0 8.2h30v3.6H0z', fill: '#C8102E' },
    ],
  },
  ru: { name: 'Русский', flag: h3('#FFFFFF', '#0039A6', '#D52B1E') },
  ar: {
    name: 'العربية',
    flag: [
      { d: 'M0 0h30v20H0z', fill: '#006C35' },
      { d: 'M7 13h16v1.4H7z', fill: '#FFFFFF' },
    ],
  },
  es: {
    name: 'Español',
    flag: [
      { d: 'M0 0h30v20H0z', fill: '#AA151B' },
      { d: 'M0 5h30v10H0z', fill: '#F1BF00' },
    ],
  },
  de: { name: 'Deutsch', flag: h3('#000000', '#DD0000', '#FFCE00') },
  fr: { name: 'Français', flag: v3('#0055A4', '#FFFFFF', '#EF4135') },
  it: { name: 'Italiano', flag: v3('#009246', '#FFFFFF', '#CE2B37') },
  zh: {
    name: '中文',
    flag: [
      { d: 'M0 0h30v20H0z', fill: '#EE1C25' },
      { d: star(5, 5, 3), fill: '#FFFF00' },
      { d: star(10, 2, 1), fill: '#FFFF00' },
      { d: star(12, 4, 1), fill: '#FFFF00' },
      { d: star(12, 7, 1), fill: '#FFFF00' },
      { d: star(10, 9, 1), fill: '#FFFF00' },
    ],
  },
};

/**
 * Club content (plans, exercises, descriptions) is written by the club in these languages;
 * other interface languages show the English version of that content.
 */
export const CONTENT_LOCALES = ['sr', 'en', 'ru', 'ar'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export const toContentLocale = (l: string): ContentLocale =>
  (CONTENT_LOCALES as readonly string[]).includes(l)
    ? (l as ContentLocale)
    : (SUPPORTED_LOCALES as readonly string[]).includes(l)
      ? 'en'
      : 'sr';

/** Intl locale tags used for dates, numbers and currency. */
export const INTL_LOCALE: Record<SupportedLocale, string> = {
  sr: 'sr-Latn-RS',
  en: 'en-GB',
  ru: 'ru-RU',
  ar: 'ar-u-nu-latn', // Arabic text with Western digits (docs/DECISIONS.md §5)
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  zh: 'zh-CN',
};

export const isRtl = (locale: string) => RTL_LOCALES.has(locale as SupportedLocale);

export function normalizeLocale(input: string | null | undefined): SupportedLocale {
  const base = (input ?? '').toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as SupportedLocale)
    : DEFAULT_LOCALE;
}

/** Creates an isolated i18next instance shared by admin, website and mobile (plugins added by each app). */
export async function createI18n(
  locale: string,
  extra: Partial<InitOptions> = {},
  plugins: Parameters<i18n['use']>[0][] = [],
): Promise<i18n> {
  const instance = i18next.createInstance();
  for (const plugin of plugins) instance.use(plugin);
  await instance.init({
    resources,
    lng: normalizeLocale(locale),
    // New interface languages show English where a text is not translated yet.
    fallbackLng: {
      default: ['sr'],
      ru: ['en'],
      ar: ['en'],
      es: ['en'],
      de: ['en'],
      fr: ['en'],
      it: ['en'],
      zh: ['en'],
    },
    // React escapes output. {{club}} is the club name, set from the club settings (setClubName).
    interpolation: { escapeValue: false, defaultVariables: { club: DEFAULT_CLUB_NAME } },
    returnNull: false,
    ...extra,
  });
  return instance;
}

export const DEFAULT_CLUB_NAME = 'GRIT';

/** Uses the club name from the admin settings in every text that mentions the club. */
export function setClubName(instance: i18n, name: string | null | undefined) {
  const vars = (instance.options.interpolation ??= {});
  vars.defaultVariables = { ...vars.defaultVariables, club: name?.trim() || DEFAULT_CLUB_NAME };
}

/** Formats money stored as integer minor units (para). */
export function formatMoney(minor: number, currency: string, locale: SupportedLocale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
