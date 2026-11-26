import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { withStaffTx } from '../database/tx';
import { AppError } from './errors';

/**
 * Where uploaded images live. Local disk in development/tests (served at /media);
 * production plugs in Supabase Storage (public bucket) behind the same interface.
 */
export interface MediaStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  url(key: string): string;
}

export function createLocalMediaStore(dir: string, publicBaseUrl: string): MediaStore {
  const safe = (key: string) => {
    if (!/^[a-z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(key)) throw new Error('invalid media key');
    return path.join(dir, key);
  };
  return {
    async put(key, data) {
      const file = safe(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async remove(key) {
      await rm(safe(key), { force: true });
    },
    url: (key) => `${publicBaseUrl.replace(/\/$/, '')}/${key}`,
  };
}

const MAX_BYTES = 1024 * 1024;
const TYPES = [
  {
    type: 'image/jpeg',
    ext: 'jpg',
    magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: 'image/png',
    ext: 'png',
    magic: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    magic: (b: Buffer) =>
      b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/**
 * Decodes a data URL / base64 image and checks the real file signature (never trusts the
 * declared type). Only JPEG, PNG and WebP up to 1 MB; clients resize before uploading.
 */
export function decodeImage(input: string): { data: Buffer; type: string; ext: string } {
  const b64 = input.replace(/^data:[^;,]+;base64,/, '');
  const data = Buffer.from(b64, 'base64');
  const invalid = () =>
    new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
      { path: 'image', message: 'validation.invalid_image' },
    ]);
  if (data.length < 16) throw invalid();
  if (data.length > MAX_BYTES)
    throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
      { path: 'image', message: 'validation.image_too_large' },
    ]);
  const t = TYPES.find((x) => x.magic(data));
  if (!t) throw invalid();
  return { data, type: t.type, ext: t.ext };
}

export const mediaKey = (folder: string, id: string, ext: string) =>
  `${folder}/${id}-${randomBytes(6).toString('hex')}.${ext}`;

/**
 * Local store only: copies the built-in club photos (repo `assets/club`) to `<dir>/defaults`
 * so the gallery and login photo work out of the box. Existing files are never overwritten.
 */
export async function installDefaultClubMedia(dir: string) {
  const { copyFile, readdir, stat } = await import('node:fs/promises');
  const source = await defaultPhotoDir();
  if (!source) return;
  const target = path.join(dir, 'defaults');
  await mkdir(target, { recursive: true });
  for (const name of await readdir(source)) {
    if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
    const to = path.join(target, name);
    const exists = await stat(to).then(
      () => true,
      () => false,
    );
    if (!exists) await copyFile(path.join(source, name), to);
  }
}

/** Store that can tell whether a key already exists (used to seed the default photos once). */
export type SeedableMediaStore = MediaStore & { exists(key: string): Promise<boolean> };

/**
 * Supabase Storage (public bucket) for staging/production: container disks are temporary,
 * so uploads must live outside the API. Uses the service-role key, server side only.
 */
/**
 * Images in the database (table media_objects), served by the API at `publicBaseUrl/<key>`.
 * Works anywhere the API runs; no external storage or keys.
 */
export function createDbMediaStore(
  db: Kysely<DB>,
  publicBaseUrl: string,
): SeedableMediaStore & { get(key: string): Promise<{ type: string; data: Buffer } | null> } {
  const valid = (key: string) => /^[a-z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(key);
  const check = (key: string) => {
    if (!valid(key)) throw new Error('invalid media key');
    return key;
  };
  return {
    async put(key, data, contentType) {
      await withStaffTx(db, (tx) =>
        tx
          .insertInto('media_objects')
          .values({ key: check(key), content_type: contentType, data })
          .onConflict((oc) =>
            oc
              .column('key')
              .doUpdateSet({ content_type: contentType, data, created_at: new Date() }),
          )
          .execute(),
      );
    },
    async remove(key) {
      await withStaffTx(db, (tx) =>
        tx.deleteFrom('media_objects').where('key', '=', check(key)).execute(),
      );
    },
    async exists(key) {
      const row = await withStaffTx(db, (tx) =>
        tx
          .selectFrom('media_objects')
          .select('key')
          .where('key', '=', check(key))
          .executeTakeFirst(),
      );
      return Boolean(row);
    },
    async get(key) {
      if (!valid(key)) return null;
      const row = await withStaffTx(db, (tx) =>
        tx
          .selectFrom('media_objects')
          .select(['content_type', 'data'])
          .where('key', '=', key)
          .executeTakeFirst(),
      );
      return row ? { type: row.content_type, data: Buffer.from(row.data) } : null;
    },
    url: (key) => `${publicBaseUrl.replace(/\/$/, '')}/${key}`,
  };
}

/**
 * Headers for server-side Supabase calls. Legacy service_role keys are JWTs (sent as apikey and
 * Bearer); the newer sb_secret_... keys are not JWTs and Supabase rejects them as Bearer.
 */
export function supabaseServiceHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key };
}

export function createSupabaseMediaStore(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  fetchImpl?: typeof fetch;
}): SeedableMediaStore {
  const base = opts.supabaseUrl.replace(/\/$/, '');
  const f = opts.fetchImpl ?? fetch;
  const check = (key: string) => {
    if (!/^[a-z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(key)) throw new Error('invalid media key');
    return `${encodeURIComponent(opts.bucket)}/${key}`;
  };
  const headers = supabaseServiceHeaders(opts.serviceRoleKey);
  return {
    async put(key, data, contentType) {
      const res = await f(`${base}/storage/v1/object/${check(key)}`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': contentType,
          'x-upsert': 'true',
          'cache-control': 'max-age=31536000',
        },
        body: new Uint8Array(data),
      });
      if (!res.ok)
        throw new Error(
          `storage upload failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`,
        );
    },
    async remove(key) {
      const res = await f(`${base}/storage/v1/object/${check(key)}`, { method: 'DELETE', headers });
      if (!res.ok && res.status !== 404 && res.status !== 400)
        throw new Error(`storage delete failed: ${res.status}`);
    },
    async exists(key) {
      const res = await f(`${base}/storage/v1/object/public/${check(key)}`, { method: 'HEAD' });
      return res.ok;
    },
    url: (key) => `${base}/storage/v1/object/public/${check(key)}`,
  };
}

/** Built-in club photos: repo `assets/club`, found from the source tree and from the bundled build. */
async function defaultPhotoDir(): Promise<string | null> {
  const { stat } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  for (const rel of ['../../../../assets/club/', '../../../assets/club/', '../assets/club/']) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (
      await stat(dir).then(
        (s) => s.isDirectory(),
        () => false,
      )
    )
      return dir;
  }
  return null;
}

/** Remote store: uploads the default photos once (never overwrites what the club changed). */
export async function seedDefaultClubMedia(store: SeedableMediaStore) {
  const { readFile, readdir } = await import('node:fs/promises');
  const source = await defaultPhotoDir();
  if (!source) return;
  for (const name of await readdir(source)) {
    const m = /\.(jpe?g|png|webp)$/i.exec(name);
    if (!m) continue;
    const key = `defaults/${name}`;
    if (await store.exists(key)) continue;
    const type =
      m[1]!.toLowerCase() === 'png'
        ? 'image/png'
        : m[1]!.toLowerCase() === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    await store.put(key, await readFile(path.join(source, name)), type);
  }
}
