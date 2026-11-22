import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createI18n, formatMoney, isRtl, normalizeLocale, resources } from '../src';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

describe('translation catalogs', () => {
  // Plural suffixes differ by language (sr: one/few/other, en: one/other), so compare base keys.
  const base = (ks: string[]) =>
    [...new Set(ks.map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')))].sort();

  it('sr, en and ru have the same keys (ignoring language-specific plural forms)', () => {
    expect(base(keys(resources.en.translation))).toEqual(base(keys(resources.sr.translation)));
    expect(base(keys(resources.ru.translation))).toEqual(base(keys(resources.sr.translation)));
  });

  it('every Russian plural has one, few, many and other forms', () => {
    const ru = keys(resources.ru.translation);
    const plurals = new Set(
      ru
        .filter((k) => /_(one|few|many|other)$/.test(k))
        .map((k) => k.replace(/_(one|few|many|other)$/, '')),
    );
    expect(plurals.size).toBeGreaterThan(3);
    for (const p of plurals) {
      expect(ru, p).toEqual(
        expect.arrayContaining([`${p}_one`, `${p}_few`, `${p}_many`, `${p}_other`]),
      );
    }
  });

  it('Russian plurals render correctly', async () => {
    const t = (await createI18n('ru')).t;
    expect(t('admin.plans.duration_days', { count: 1 })).toBe('1 день');
    expect(t('admin.plans.duration_days', { count: 3 })).toBe('3 дня');
    expect(t('admin.plans.duration_days', { count: 30 })).toBe('30 дней');
    expect(t('admin.plans.duration_days', { count: 21 })).toBe('21 день');
  });

  it('Arabic covers every member-facing key (all but admin.*), with all six plural forms', () => {
    const ar = keys(resources.ar.translation);
    const want = base(keys(resources.sr.translation)).filter((k) => !k.startsWith('admin.'));
    expect(base(ar)).toEqual(want);
    const plurals = new Set(
      ar
        .filter((k) => /_(zero|one|two|few|many|other)$/.test(k))
        .map((k) => k.replace(/_[a-z]+$/, '')),
    );
    expect(plurals.size).toBeGreaterThan(3);
    for (const p of plurals)
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other'])
        expect(ar, p).toContain(`${p}_${form}`);
  });

  it('every Serbian plural has one, few and other forms', () => {
    const sr = keys(resources.sr.translation);
    const plurals = new Set(
      sr.filter((k) => /_(one|few|other)$/.test(k)).map((k) => k.replace(/_(one|few|other)$/, '')),
    );
    for (const p of plurals) {
      expect(sr, p).toEqual(expect.arrayContaining([`${p}_one`, `${p}_few`, `${p}_other`]));
    }
  });

  it('Serbian plurals render correctly', async () => {
    const t = (await createI18n('sr')).t;
    expect(t('admin.plans.visits', { count: 1 })).toBe('1 dolazak');
    expect(t('admin.plans.visits', { count: 3 })).toBe('3 dolaska');
    expect(t('admin.plans.visits', { count: 12 })).toBe('12 dolazaka');
    expect(t('admin.plans.visits', { count: 21 })).toBe('21 dolazak');
  });

  it('newer languages (es, de, fr, it, zh) use only known keys and keep every {{placeholder}}', () => {
    const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
    const en = resources.en.translation as Record<string, unknown>;
    const get = (o: unknown, k: string) =>
      k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown> | undefined)?.[p], o);
    const known = new Set(keys(en).map(base));
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const lng of ['es', 'de', 'fr', 'it', 'zh'] as const) {
      for (const k of keys(resources[lng].translation)) {
        expect(known.has(base(k)), `${lng}:${k} has no English key`).toBe(true);
        const value = String(get(resources[lng].translation, k));
        expect(value.trim(), `${lng}:${k}`).not.toBe('');
        const source = get(en, k) ?? get(en, `${base(k)}_other`) ?? get(en, `${base(k)}_one`);
        if (typeof source === 'string')
          expect(vars(value), `${lng}:${k} placeholders`).toEqual(vars(source));
      }
    }
  });

  it('has no empty strings', () => {
    for (const lng of ['sr', 'en', 'ru', 'ar'] as const) {
      const flat = keys(resources[lng].translation);
      for (const k of flat) {
        const value = k
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], resources[lng].translation);
        expect(String(value).trim(), `${lng}:${k}`).not.toBe('');
      }
    }
  });

  it('contains every message key the API and validation layer can return', async () => {
    const files = [
      ...(await sourceFiles(path.join(repoRoot, 'apps/api/src'))),
      ...(await sourceFiles(path.join(repoRoot, 'packages/validation/src'))),
    ];
    const used = new Set<string>();
    for (const f of files) {
      const text = await readFile(f, 'utf8');
      for (const m of text.matchAll(/['`]((?:errors|validation)\.[a-z_]+(?:\.[a-z_]+)*)['`]/g))
        used.add(m[1]!);
      // notFound('member') → errors.member.not_found
      for (const m of text.matchAll(/notFound\('([a-z_]+)'\)/g))
        used.add(`errors.${m[1]}.not_found`);
    }
    const available = new Set(keys(resources.sr.translation));
    const missing = [...used].filter((k) => !available.has(k));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(10);
  });
});

describe('i18n runtime', () => {
  it('defaults to Serbian and falls back for unsupported locales', async () => {
    expect(normalizeLocale('pt-BR')).toBe('sr');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('de-DE')).toBe('de');
    const de = (await createI18n('de')).t;
    expect(de('common.save')).toBe('Speichern');
    expect(de('admin.nav.members')).toBe('Mitglieder');
    const t = (await createI18n('sr')).t;
    expect(t('membership.status.expiring_soon')).toBe('Uskoro ističe');
  });

  it('has full Russian and member-facing Arabic catalogs; admin Arabic falls back to English', async () => {
    expect((await createI18n('ru')).t('common.save')).toBe('Сохранить');
    const ar = (await createI18n('ar')).t;
    expect(ar('common.save')).toBe('حفظ');
    expect(ar('admin.nav.members')).toBe('Members');
    expect(ar('app.log.sets', { count: 1 })).toBe('مجموعة واحدة');
    expect(ar('app.log.sets', { count: 2 })).toBe('مجموعتان');
    expect(ar('app.log.sets', { count: 5 })).toBe('5 مجموعات');
    expect(ar('app.log.sets', { count: 11 })).toBe('11 مجموعة');
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('sr')).toBe(false);
  });

  it('formats RSD amounts from minor units', () => {
    expect(formatMoney(2_400_000, 'RSD', 'sr')).toMatch(/24\.000/);
  });
});
