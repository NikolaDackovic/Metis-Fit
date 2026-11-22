import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
});
afterAll(async () => h?.close());

describe('club profile', () => {
  it('starts with the built-in GRIT photos and login image', async () => {
    const pub = await h.http.get('/v1/public/club');
    expect(pub.body.data.logoUrl).toBeNull();
    expect(pub.body.data.loginImageUrl).toMatch(/defaults\/main-hall\.jpg$/);
    expect(pub.body.data.photos).toHaveLength(6);
    expect(pub.body.data.photos[0].captions).toMatchObject({
      sr: 'Glavna sala',
      ar: 'القاعة الرئيسية',
    });
  });

  it('managers edit name, slogan, contact and hours; reception cannot', async () => {
    const body = {
      name: 'GRIT Fitness Center',
      shortName: 'GRIT',
      tagline: { sr: 'Više od teretane', en: 'More than a gym' },
      phone: '+381 62 1090 771',
      email: 'info@gritgym.rs',
      address: 'Sarajevska, Beograd',
      website: 'https://gritgym.rs',
      instagram: 'https://www.instagram.com/grit.rs/',
      facebook: '',
    };
    expect((await h.http.put('/v1/admin/club').set(reception.auth).send(body)).status).toBe(403);
    const r = await h.http.put('/v1/admin/club').set(manager.auth).send(body);
    expect(r.status).toBe(200);
    expect(r.body.data.profile).toMatchObject({
      tagline: { sr: 'Više od teretane' },
      facebook: null,
    });
    const bad = await h.http
      .put('/v1/admin/club')
      .set(manager.auth)
      .send({ ...body, website: 'http://x' });
    expect(bad.status).toBe(400);

    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      isClosed: weekday === 7,
      opensAt: weekday === 7 ? null : '06:00',
      closesAt: weekday === 7 ? null : '22:00',
    }));
    const hours = await h.http.put('/v1/admin/club/hours').set(manager.auth).send({ days });
    expect(hours.body.data.openingHours[0]).toEqual({
      weekday: 1,
      opensAt: '06:00',
      closesAt: '22:00',
      isClosed: false,
    });
    const wrong = days.map((d) => (d.weekday === 1 ? { ...d, closesAt: '05:00' } : d));
    expect(
      (await h.http.put('/v1/admin/club/hours').set(manager.auth).send({ days: wrong })).status,
    ).toBe(400);

    const pub = await h.http.get('/v1/public/club');
    expect(pub.body.data.info).toMatchObject({ name: 'GRIT Fitness Center', short_name: 'GRIT' });
    expect(pub.body.data.openingHours[6]).toMatchObject({ weekday: 7, isClosed: true });
  });

  it('uploads and resets the logo and login photo, and manages the gallery', async () => {
    const logo = await h.http
      .put('/v1/admin/club/media/logo')
      .set(manager.auth)
      .send({ image: png });
    expect(logo.status).toBe(200);
    expect(logo.body.data.logoUrl).toMatch(/\/club\/logo-.+\.png$/);
    const reset = await h.http.delete('/v1/admin/club/media/logo').set(manager.auth);
    expect(reset.body.data.logoUrl).toBeNull();
    const login = await h.http
      .put('/v1/admin/club/media/login_image')
      .set(manager.auth)
      .send({ image: png });
    expect(login.body.data.loginImageUrl).toMatch(/login-image/);
    const back = await h.http.delete('/v1/admin/club/media/login_image').set(manager.auth);
    expect(back.body.data.loginImageUrl).toMatch(/defaults\/main-hall\.jpg$/);

    const added = await h.http
      .post('/v1/admin/club/media/photos')
      .set(manager.auth)
      .send({ image: png, captions: { sr: 'Bašta', en: 'Garden' } });
    expect(added.status).toBe(201);
    const photo = added.body.data.photos.at(-1);
    expect(photo.captions).toEqual({ sr: 'Bašta', en: 'Garden' });
    const moved = await h.http
      .put(`/v1/admin/club/photos/${photo.id}`)
      .set(manager.auth)
      .send({ captions: { sr: 'Letnja bašta' }, sortOrder: 0 });
    expect(moved.body.data.photos[0]).toMatchObject({
      id: photo.id,
      captions: { sr: 'Letnja bašta' },
    });
    const del = await h.http.delete(`/v1/admin/club/photos/${photo.id}`).set(manager.auth);
    expect(del.body.data.photos).toHaveLength(6);
    expect(
      (
        await h.http
          .put('/v1/admin/club/media/logo')
          .set(manager.auth)
          .send({ image: 'data:image/png;base64,bm90IGFuIGltYWdlIGF0IGFsbCBoZXJl' })
      ).status,
    ).toBe(400);
  });
});
