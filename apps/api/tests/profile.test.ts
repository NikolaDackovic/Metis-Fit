import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

let h: Harness;
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

describe('own profile', () => {
  it('a member edits their name and sets / removes a profile photo', async () => {
    const m = await h.user({ member: true });
    const named = await h.http
      .patch('/v1/me')
      .set(m.auth)
      .send({ firstName: 'Marko', lastName: 'Marković' });
    expect(named.body.data).toMatchObject({
      firstName: 'Marko',
      lastName: 'Marković',
      avatarUrl: null,
    });

    const up = await h.http.put('/v1/me/avatar').set(m.auth).send({ image: png });
    expect(up.status).toBe(200);
    expect(up.body.data.avatarUrl).toMatch(/\/media\/avatars\/.+\.png$/);
    const file = await h.http.get(up.body.data.avatarUrl.replace('http://localhost', ''));
    expect(file.status).toBe(200);

    const bad = await h.http
      .put('/v1/me/avatar')
      .set(m.auth)
      .send({ image: 'data:image/png;base64,aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYW4gaW1hZ2U=' });
    expect(bad.status).toBe(400);

    const del = await h.http.delete('/v1/me/avatar').set(m.auth);
    expect(del.body.data.avatarUrl).toBeNull();
  });
});
