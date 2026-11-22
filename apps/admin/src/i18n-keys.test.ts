import { resources } from '@grit/translations';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every literal translation key used in the admin source must exist in both catalogs,
 * otherwise users would see raw keys like "admin.members.title".
 */
const srcDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(dir, e.name))
      : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts')
        ? [path.join(dir, e.name)]
        : [],
  );
}

function has(catalog: object, key: string): boolean {
  const get = (k: string) =>
    k
      .split('.')
      .reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], catalog);
  return (
    get(key) !== undefined || get(`${key}_one`) !== undefined || get(`${key}_other`) !== undefined
  );
}

describe('admin translation keys', () => {
  const used = new Set<string>();
  for (const f of files(srcDir)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(
      /['"`]((?:admin|common|errors|validation|membership)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)['"`]/g,
    )) {
      used.add(m[1]!);
    }
  }

  it('finds keys in the source', () => {
    expect(used.size).toBeGreaterThan(150);
  });

  for (const lng of ['sr', 'en', 'ru'] as const) {
    it(`all keys exist in ${lng}`, () => {
      const missing = [...used].filter((k) => !has(resources[lng].translation, k));
      expect(missing).toEqual([]);
    });
  }
});
