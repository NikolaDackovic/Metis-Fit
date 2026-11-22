import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  ClubAdminDto,
  ClubPhotoDto,
  ClubProfileBody,
  OpeningHoursBody,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { isDarkEnough } from '@grit/design-tokens';
import { AppError } from '../../shared/errors';
import { decodeImage, mediaKey, type MediaStore } from '../../shared/media';

const PROFILE_KEYS = {
  name: 'club.name',
  shortName: 'club.short_name',
  tagline: 'club.tagline',
  phone: 'club.phone',
  email: 'club.email',
  address: 'club.address',
  website: 'club.website',
  instagram: 'club.instagram',
  facebook: 'club.facebook',
  accentColor: 'club.color_accent',
  backgroundColor: 'club.color_background',
} as const;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
/** Older installs stored the slogan as one English string. */
const taglineOf = (v: unknown): Record<string, string> =>
  typeof v === 'string'
    ? { en: v }
    : v && typeof v === 'object'
      ? (v as Record<string, string>)
      : {};

async function settingsMap(tx: Tx) {
  const rows = await tx
    .selectFrom('settings')
    .select(['key', 'value'])
    .where('key', 'like', 'club.%')
    .execute();
  return new Map(rows.map((r) => [r.key, r.value as unknown]));
}

export async function clubPhotos(tx: Tx, media: MediaStore): Promise<ClubPhotoDto[]> {
  const rows = await tx
    .selectFrom('club_photos')
    .selectAll()
    .orderBy('sort_order')
    .orderBy('created_at')
    .execute();
  return rows.map((p) => ({
    id: p.id,
    url: media.url(p.path),
    captions: (p.captions ?? {}) as Record<string, string>,
    sortOrder: p.sort_order,
  }));
}

/** Public extras for /public/club: media URLs and the gallery. */
export async function publicClubMedia(tx: Tx, media: MediaStore) {
  const s = await settingsMap(tx);
  const logo = str(s.get('club.logo'));
  const login = str(s.get('club.login_image'));
  return {
    logoUrl: logo ? media.url(logo) : null,
    loginImageUrl: login ? media.url(login) : null,
    photos: await clubPhotos(tx, media),
  };
}

async function load(tx: Tx, media: MediaStore): Promise<ClubAdminDto> {
  const s = await settingsMap(tx);
  // Without a saved profile the gym's registered name is used (never another gym's brand).
  const gym = await sql<{
    name: string;
  }>`select name from public.clubs where id = public.current_club_id()`
    .execute(tx)
    .then((r) => r.rows[0]?.name ?? '');
  const hours = await tx.selectFrom('opening_hours').selectAll().orderBy('weekday').execute();
  return {
    profile: {
      name: str(s.get('club.name')) ?? gym,
      shortName: str(s.get('club.short_name')) ?? (str(s.get('club.name')) ?? gym).slice(0, 20),
      tagline: taglineOf(s.get('club.tagline')),
      phone: str(s.get('club.phone')),
      email: str(s.get('club.email')),
      address: str(s.get('club.address')),
      website: str(s.get('club.website')),
      instagram: str(s.get('club.instagram')),
      facebook: str(s.get('club.facebook')),
      accentColor: str(s.get('club.color_accent')),
      backgroundColor: str(s.get('club.color_background')),
    },
    ...(await publicClubMedia(tx, media)),
    // A new gym has no hours yet: all seven days are listed (closed) until the owner sets them.
    openingHours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const h = hours.find((x) => x.weekday === weekday);
      return {
        weekday,
        opensAt: h?.opens_at?.slice(0, 5) ?? null,
        closesAt: h?.closes_at?.slice(0, 5) ?? null,
        isClosed: h ? h.is_closed : true,
      };
    }),
  };
}

async function setSetting(tx: Tx, actor: Actor, key: string, value: unknown) {
  const v = JSON.stringify(value ?? null);
  await tx
    .insertInto('settings')
    .values({ key, value: v, updated_by: actor.userId })
    .onConflict((oc) =>
      oc.columns(['club_id', 'key']).doUpdateSet({ value: v, updated_by: actor.userId }),
    )
    .execute();
}

export function createClubService(db: Kysely<DB>, media: MediaStore) {
  return {
    get: () => withStaffTx(db, (tx) => load(tx, media)),

    updateProfile: (actor: Actor, req: Request, b: ClubProfileBody) =>
      withStaffTx(db, async (tx) => {
        // White text must stay readable on the background (WCAG AAA 7:1).
        if (b.backgroundColor && !isDarkEnough(b.backgroundColor))
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'backgroundColor', message: 'validation.background_too_light' },
          ]);
        const tagline = Object.fromEntries(Object.entries(b.tagline).filter(([, v]) => v?.trim()));
        for (const [field, key] of Object.entries(PROFILE_KEYS)) {
          const value = field === 'tagline' ? tagline : (b[field as keyof ClubProfileBody] ?? null);
          await setSetting(tx, actor, key, value);
        }
        await writeAudit(tx, actor, req, {
          action: 'club.update',
          entityType: 'settings',
          entityId: null,
          diff: { after: { name: b.name, shortName: b.shortName } },
        });
        return load(tx, media);
      }),

    updateHours: (actor: Actor, req: Request, b: OpeningHoursBody) =>
      withStaffTx(db, async (tx) => {
        for (const d of b.days) {
          if (!d.isClosed && (!d.opensAt || !d.closesAt || d.closesAt <= d.opensAt))
            throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
              { path: `days.${d.weekday}`, message: 'validation.date_order' },
            ]);
          const v = {
            opens_at: d.isClosed ? null : d.opensAt,
            closes_at: d.isClosed ? null : d.closesAt,
            is_closed: d.isClosed,
          };
          await tx
            .insertInto('opening_hours')
            .values({ weekday: d.weekday, ...v })
            .onConflict((oc) => oc.columns(['club_id', 'weekday']).doUpdateSet(v))
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'club.hours_update',
          entityType: 'opening_hours',
          entityId: null,
          diff: { after: { days: b.days } },
        });
        return load(tx, media);
      }),

    /** Logo or login photo; `null` image resets to the built-in default. */
    setMedia: (actor: Actor, req: Request, slot: 'logo' | 'login_image', image: string | null) =>
      withStaffTx(db, async (tx) => {
        const key = `club.${slot}`;
        const old = str((await settingsMap(tx)).get(key));
        let next: string | null = slot === 'login_image' ? 'defaults/main-hall.jpg' : null;
        if (image) {
          const img = decodeImage(image);
          next = mediaKey('club', slot.replace('_', '-'), img.ext);
          await media.put(next, img.data, img.type);
        }
        await setSetting(tx, actor, key, next);
        if (old && old !== next && !old.startsWith('defaults/'))
          await media.remove(old).catch(() => undefined);
        await writeAudit(tx, actor, req, {
          action: 'club.media_update',
          entityType: 'settings',
          entityId: null,
          diff: { after: { slot, reset: !image } },
        });
        return load(tx, media);
      }),

    addPhoto: (actor: Actor, req: Request, image: string, captions: Record<string, string>) =>
      withStaffTx(db, async (tx) => {
        const count = await tx
          .selectFrom('club_photos')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .executeTakeFirstOrThrow();
        if (Number(count.n) >= 30) throw new AppError('BUSINESS_RULE', 'errors.club.photo_limit');
        const img = decodeImage(image);
        const key = mediaKey('club', 'photo', img.ext);
        await media.put(key, img.data, img.type);
        const last = await tx
          .selectFrom('club_photos')
          .select((eb) => eb.fn.max('sort_order').as('m'))
          .executeTakeFirst();
        const row = await tx
          .insertInto('club_photos')
          .values({
            path: key,
            captions: JSON.stringify(captions),
            sort_order: Number(last?.m ?? 0) + 10,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'club.photo_add',
          entityType: 'club_photo',
          entityId: row.id,
          diff: null,
        });
        return load(tx, media);
      }),

    updatePhoto: (
      actor: Actor,
      req: Request,
      id: string,
      captions: Record<string, string>,
      sortOrder: number,
    ) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('club_photos')
          .set({ captions: JSON.stringify(captions), sort_order: sortOrder })
          .where('id', '=', id)
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows))
          throw new AppError('NOT_FOUND', 'errors.club.photo_not_found');
        await writeAudit(tx, actor, req, {
          action: 'club.photo_update',
          entityType: 'club_photo',
          entityId: id,
          diff: { after: { sortOrder } },
        });
        return load(tx, media);
      }),

    removePhoto: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .deleteFrom('club_photos')
          .where('id', '=', id)
          .returning('path')
          .executeTakeFirst();
        if (!row) throw new AppError('NOT_FOUND', 'errors.club.photo_not_found');
        if (!row.path.startsWith('defaults/')) await media.remove(row.path).catch(() => undefined);
        await writeAudit(tx, actor, req, {
          action: 'club.photo_remove',
          entityType: 'club_photo',
          entityId: id,
          diff: null,
        });
        return load(tx, media);
      }),
  };
}
