import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbMediaStore } from '../src/shared/media';
import { createHarness, type Harness } from './harness';

/** MEDIA_STORE=db: images live in the database and are served by the API. */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

describe('database media store', () => {
  it('stores, replaces, reads and removes an image; rejects odd keys', async () => {
    const store = createDbMediaStore(h.db, 'https://api.example.rs/media/');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(await store.exists('club/logo-a.png')).toBe(false);
    await store.put('club/logo-a.png', png, 'image/png');
    expect(await store.exists('club/logo-a.png')).toBe(true);
    expect(await store.get('club/logo-a.png')).toEqual({ type: 'image/png', data: png });
    await store.put('club/logo-a.png', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    expect((await store.get('club/logo-a.png'))?.type).toBe('image/jpeg');
    expect(store.url('club/logo-a.png')).toBe('https://api.example.rs/media/club/logo-a.png');
    await store.remove('club/logo-a.png');
    expect(await store.get('club/logo-a.png')).toBeNull();
    expect(await store.get('../etc/passwd')).toBeNull();
    await expect(store.put('../x', png, 'image/png')).rejects.toThrow();
  });
});
