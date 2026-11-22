import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resources } from '@grit/translations';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

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
  return get(key) !== undefined || get(`${key}_one`) !== undefined;
}

describe('mobile translation keys', () => {
  const used = new Set<string>();
  for (const f of files(srcDir)) {
    for (const m of readFileSync(f, 'utf8').matchAll(
      /['"`]((?:app|admin|common|errors|validation|membership)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)['"`]/g,
    )) {
      used.add(m[1]!);
    }
  }

  it('finds keys in the source', () => expect(used.size).toBeGreaterThan(40));

  for (const lng of ['sr', 'en', 'ru'] as const) {
    it(`all keys exist in ${lng}`, () => {
      expect([...used].filter((k) => !has(resources[lng].translation, k))).toEqual([]);
    });
  }
});
