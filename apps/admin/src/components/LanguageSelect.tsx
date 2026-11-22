import { LOCALE_INFO, SUPPORTED_LOCALES, type SupportedLocale } from '@grit/translations';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/Field';
import { changeLocale } from '@/lib/i18n';

/** Flag drawn from shared SVG shapes (flag emoji do not render on Windows). */
export function Flag({ locale, className }: { locale: SupportedLocale; className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      className={cn(
        'h-4 w-6 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-white/15',
        className,
      )}
      aria-hidden="true"
    >
      {LOCALE_INFO[locale].flag.map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} />
      ))}
    </svg>
  );
}

const current = (lng: string) =>
  (SUPPORTED_LOCALES as readonly string[]).includes(lng) ? (lng as SupportedLocale) : 'sr';

/** Compact select (login page, phone menu). Names are endonyms, each in its own language. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <Select
      aria-label={t('admin.nav.language')}
      value={current(i18n.language)}
      onChange={(e) => void changeLocale(i18n, e.target.value as SupportedLocale)}
      className={className}
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_INFO[l].name}
        </option>
      ))}
    </Select>
  );
}

/** Settings: every language as a card with its flag and name. */
export function LanguageGrid() {
  const { t, i18n } = useTranslation();
  const active = current(i18n.language);
  return (
    <div
      role="radiogroup"
      aria-label={t('admin.nav.language')}
      className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === active}
          lang={l}
          onClick={() => void changeLocale(i18n, l)}
          className={cn(
            'flex min-w-0 items-center gap-3 rounded-sm border px-3 py-2.5 text-start text-sm font-semibold transition-colors',
            l === active
              ? 'border-accent-500 bg-accent-tint text-text-primary'
              : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
          )}
        >
          <Flag locale={l} />
          <span className="min-w-0 flex-1 truncate">{LOCALE_INFO[l].name}</span>
          {l === active && <Check className="size-4 shrink-0 text-accent-400" />}
        </button>
      ))}
    </div>
  );
}
