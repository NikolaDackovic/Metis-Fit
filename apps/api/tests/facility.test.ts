import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MapDto } from '@grit/validation';
import { reportLimiter } from '../src/modules/facility/facility.routes';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let member: TestUser;

const equipmentBody = (name: string) => ({
  categoryKey: 'cardio',
  manufacturer: 'Acme',
  serialNumber: 'SN-SECRET-1',
  translations: {
    sr: { name, usageInstructions: 'Podesi sedište.' },
    ru: { name: `${name} RU`, usageInstructions: 'Отрегулируйте сиденье.' },
  },
});

function draftBody(map: MapDto, equipmentId?: string) {
  return {
    revision: map.revision,
    isSchematic: true,
    floors: [
      {
        key: 'ground',
        level: 0,
        width: 40,
        height: 20,
        names: { sr: 'Prizemlje', ru: 'Первый этаж' },
        rooms: [
          {
            key: 'gym',
            type: 'gym',
            shape: { type: 'rect', x: 0, y: 0, w: 20, h: 10 },
            names: { sr: 'Teretana', ru: 'Тренажёрный зал' },
            placements: equipmentId ? [{ equipmentId, x: 5, y: 5 }] : [],
          },
          {
            key: 'pool',
            type: 'pool',
            shape: { type: 'rect', x: 20, y: 0, w: 20, h: 5 },
            names: { sr: 'Bazen' },
            isHidden: true,
          },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  member = await h.user({ member: true });
});
afterAll(async () => h?.close());
beforeEach(() => reportLimiter.reset());

describe('equipment', () => {
  let id: string;
  beforeAll(async () => {
    const res = await h.http
      .post('/v1/admin/equipment')
      .set(manager.auth)
      .send(equipmentBody('Traka'));
    expect(res.status).toBe(201);
    id = res.body.data.id;
  });

  it('public catalogue is localized and hides internal fields', async () => {
    const res = await h.http.get(`/v1/public/equipment/${id}`).query({ locale: 'ru' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Traka RU',
      usageInstructions: 'Отрегулируйте сиденье.',
      status: 'available',
    });
    expect(JSON.stringify(res.body.data)).not.toContain('SN-SECRET-1');
  });

  it('reception cannot edit equipment; members cannot see the admin list', async () => {
    expect(
      (
        await h.http
          .patch(`/v1/admin/equipment/${id}`)
          .set(reception.auth)
          .send({ status: 'maintenance' })
      ).status,
    ).toBe(403);
    expect((await h.http.get('/v1/admin/equipment').set(member.auth)).status).toBe(403);
  });

  it('archived equipment disappears from the public catalogue but is kept', async () => {
    const other = (
      await h.http.post('/v1/admin/equipment').set(manager.auth).send(equipmentBody('Stara'))
    ).body.data.id;
    await h.http.post(`/v1/admin/equipment/${other}/archive`).set(manager.auth).send();
    expect((await h.http.get(`/v1/public/equipment/${other}`)).status).toBe(404);
    const row = await h.db
      .selectFrom('equipment')
      .select('archived_at')
      .where('id', '=', other)
      .executeTakeFirst();
    expect(row?.archived_at).not.toBeNull();
  });
});

describe('map editor and publishing', () => {
  it('draft → publish → public map; hidden rooms never reach the public', async () => {
    const eq = (
      await h.http.post('/v1/admin/equipment').set(manager.auth).send(equipmentBody('Bicikl'))
    ).body.data.id;
    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    expect(draft.floors).toEqual([]);

    const saved = await h.http
      .put('/v1/admin/map/draft')
      .set(manager.auth)
      .send(draftBody(draft, eq));
    expect(saved.status).toBe(200);
    expect(saved.body.data.revision).toBe(draft.revision + 1);

    expect((await h.http.get('/v1/public/map')).body.data).toBeNull(); // nothing published yet

    const pub = await h.http.post('/v1/admin/map/publish').set(manager.auth).send();
    expect(pub.status).toBe(200);

    const map = (await h.http.get('/v1/public/map').query({ locale: 'ru' })).body.data as MapDto;
    expect(map.isSchematic).toBe(true);
    expect(map.floors[0]!.name).toBe('Первый этаж');
    expect(map.floors[0]!.rooms.map((r) => r.key)).toEqual(['gym']); // pool hidden
    expect(map.floors[0]!.rooms[0]!.placements[0]).toMatchObject({
      equipmentId: eq,
      name: 'Bicikl RU',
    });

    const detail = await h.http.get(`/v1/public/equipment/${eq}`).query({ locale: 'sr' });
    expect(detail.body.data.location).toMatchObject({ roomKey: 'gym', roomName: 'Teretana' });
  });

  it('rejects a stale revision (two editors) and unknown equipment', async () => {
    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    const first = await h.http.put('/v1/admin/map/draft').set(manager.auth).send(draftBody(draft));
    expect(first.status).toBe(200);
    const stale = await h.http.put('/v1/admin/map/draft').set(manager.auth).send(draftBody(draft));
    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe('errors.map.stale_revision');

    const fresh = first.body.data as MapDto;
    const bad = await h.http
      .put('/v1/admin/map/draft')
      .set(manager.auth)
      .send(draftBody(fresh, '00000000-0000-4000-8000-000000000000'));
    expect(bad.body.message).toBe('errors.map.unknown_equipment');
  });

  it('removing rooms from the draft never deletes equipment', async () => {
    const before = await h.db.selectFrom('equipment').select('id').execute();
    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    const body = draftBody(draft);
    body.floors[0]!.rooms = [];
    expect((await h.http.put('/v1/admin/map/draft').set(manager.auth).send(body)).status).toBe(200);
    const after = await h.db.selectFrom('equipment').select('id').execute();
    expect(after.length).toBe(before.length);
  });

  it('rejects duplicate room keys and reception cannot edit the map', async () => {
    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    const body = draftBody(draft);
    body.floors[0]!.rooms[1]!.key = 'gym';
    expect((await h.http.put('/v1/admin/map/draft').set(manager.auth).send(body)).status).toBe(400);
    expect((await h.http.get('/v1/admin/map/draft').set(reception.auth)).status).toBe(403);
  });

  it('floor background (Servio-style): upload, room style and opacity reach the published map', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 1),
    ]);
    const up = await h.http
      .post('/v1/admin/map/background')
      .set(manager.auth)
      .send({ image: `data:image/png;base64,${png.toString('base64')}` });
    expect(up.status).toBe(201);
    expect(up.body.data.path).toMatch(/^map\/floor-[a-f0-9]+\.png$/);

    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    const body = draftBody(draft);
    Object.assign(body.floors[0]!, {
      backgroundPath: up.body.data.path,
      backgroundOpacity: 0.6,
      roomStyle: 'labels',
    });
    const saved = await h.http.put('/v1/admin/map/draft').set(manager.auth).send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.data.floors[0]).toMatchObject({
      backgroundPath: up.body.data.path,
      backgroundUrl: up.body.data.url,
      backgroundOpacity: 0.6,
      roomStyle: 'labels',
    });
    expect((await h.http.post('/v1/admin/map/publish').set(manager.auth).send()).status).toBe(200);
    const map = (await h.http.get('/v1/public/map')).body.data as MapDto;
    expect(map.floors[0]).toMatchObject({ backgroundUrl: up.body.data.url, roomStyle: 'labels' });

    // Paths outside the media folders are rejected (no traversal into other files).
    const bad = draftBody(saved.body.data as MapDto);
    Object.assign(bad.floors[0]!, { backgroundPath: '../secret.png' });
    expect((await h.http.put('/v1/admin/map/draft').set(manager.auth).send(bad)).status).toBe(400);
    // Only images: a text file pretending to be an image is refused.
    const fake = await h.http
      .post('/v1/admin/map/background')
      .set(manager.auth)
      .send({ image: Buffer.from('not an image at all, just text').toString('base64') });
    expect(fake.status).toBe(400);
    expect(
      (
        await h.http
          .post('/v1/admin/map/background')
          .set(reception.auth)
          .send({ image: 'x'.repeat(20) })
      ).status,
    ).toBe(403);
  });

  it('the owner can hide the whole map from members', async () => {
    expect(
      (await h.http.put('/v1/admin/map/visibility').set(reception.auth).send({ visible: false }))
        .status,
    ).toBe(403);
    const off = await h.http
      .put('/v1/admin/map/visibility')
      .set(manager.auth)
      .send({ visible: false });
    expect(off.body.data).toEqual({ visible: false });
    expect((await h.http.get('/v1/public/map')).body.data).toBeNull();
    expect((await h.http.get('/v1/public/club')).body.data.info.map_visible).toBe(false);
    const draft = (await h.http.get('/v1/admin/map/draft').set(manager.auth)).body.data as MapDto;
    expect(draft.visibleToMembers).toBe(false); // the editor keeps working

    await h.http.put('/v1/admin/map/visibility').set(manager.auth).send({ visible: true });
    expect((await h.http.get('/v1/public/map')).body.data).not.toBeNull();
  });
});

describe('maintenance', () => {
  it('member reports a problem; staff triages it and takes the machine out of service', async () => {
    const eq = (
      await h.http.post('/v1/admin/equipment').set(manager.auth).send(equipmentBody('Veslo'))
    ).body.data.id;
    const rep = await h.http
      .post('/v1/me/maintenance-reports')
      .set(member.auth)
      .send({ equipmentId: eq, description: 'Kaiš proklizava' });
    expect(rep.status).toBe(201);

    // Reporting alone never changes the machine status.
    expect((await h.http.get(`/v1/public/equipment/${eq}`)).body.data.status).toBe('available');

    const list = await h.http.get('/v1/admin/maintenance').set(reception.auth);
    const item = list.body.data.find((m: { id: string }) => m.id === rep.body.data.id);
    expect(item).toMatchObject({ status: 'open', source: 'member', equipmentName: 'Veslo' });

    const upd = await h.http
      .patch(`/v1/admin/maintenance/${item.id}`)
      .set(reception.auth)
      .send({ status: 'in_progress', priority: 'high', equipmentStatus: 'out_of_service' });
    expect(upd.body.data).toMatchObject({
      status: 'in_progress',
      priority: 'high',
      equipmentStatus: 'out_of_service',
    });

    const done = await h.http
      .patch(`/v1/admin/maintenance/${item.id}`)
      .set(reception.auth)
      .send({ status: 'resolved', resolutionNote: 'Zamenjen kaiš', equipmentStatus: 'available' });
    expect(done.body.data.resolvedAt).not.toBeNull();
  });

  it('validates reports and rate-limits members', async () => {
    expect(
      (
        await h.http
          .post('/v1/me/maintenance-reports')
          .set(member.auth)
          .send({ description: 'Pokvareno' })
      ).status,
    ).toBe(400);
    for (let i = 0; i < 5; i++) {
      await h.http
        .post('/v1/me/maintenance-reports')
        .set(member.auth)
        .send({ roomKey: 'gym', description: 'Klima ne radi' });
    }
    const limited = await h.http
      .post('/v1/me/maintenance-reports')
      .set(member.auth)
      .send({ roomKey: 'gym', description: 'Klima ne radi' });
    expect(limited.status).toBe(429);
  });

  it('members cannot read the maintenance queue', async () => {
    expect((await h.http.get('/v1/admin/maintenance').set(member.auth)).status).toBe(403);
  });
});
