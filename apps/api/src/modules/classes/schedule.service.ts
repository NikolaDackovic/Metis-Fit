import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  ClassAdminDto,
  ClassTypeDto,
  CreateClassBody,
  CreateClassTypeBody,
  CreateSeriesBody,
  CreateTrainerBody,
  SeriesDto,
  TrainerAdminDto,
  TrainerDto,
  UpdateClassBody,
  UpdateClassTypeBody,
  UpdateSeriesBody,
  UpdateTrainerBody,
} from '@grit/validation';
import { withAnonTx, withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { decodeImage, mediaKey, type MediaStore } from '../../shared/media';
import { AppError, notFound } from '../../shared/errors';
import { promoteWaitlist } from './bookings.service';
import { notifyClassCancelled } from '../notifications/notify';
import {
  ensureSessions,
  loadRules,
  querySessions,
  toAdminDto,
  toSessionDto,
} from './classes.query';

const invalid = (path: string, message: string) =>
  new AppError('VALIDATION_ERROR', 'errors.validation.failed', [{ path, message }]);

// ── Trainers ──────────────────────────────────────────────────────────────────
async function trainerRows(tx: Tx, locale: string, opts: { id?: string; publicOnly: boolean }) {
  let q = tx
    .selectFrom('trainers as tr')
    .leftJoin('trainer_translations as t', (j) =>
      j.onRef('t.trainer_id', '=', 'tr.id').on('t.locale', '=', locale),
    )
    .leftJoin('trainer_translations as tsr', (j) =>
      j.onRef('tsr.trainer_id', '=', 'tr.id').on('tsr.locale', '=', 'sr'),
    )
    .select([
      'tr.id',
      'tr.first_name',
      'tr.last_name',
      'tr.instagram',
      'tr.photo_path',
      'tr.offers_personal_training',
      'tr.sort_order',
      (eb) => eb.fn.coalesce('t.title', 'tsr.title').as('title'),
      (eb) => eb.fn.coalesce('t.bio', 'tsr.bio').as('bio'),
    ])
    .orderBy('tr.sort_order')
    .orderBy('tr.last_name');
  if (opts.id) q = q.where('tr.id', '=', opts.id);
  return q.execute();
}

const toTrainerDto = (
  r: Awaited<ReturnType<typeof trainerRows>>[number],
  media?: MediaStore,
): TrainerDto => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  title: r.title,
  bio: r.bio,
  instagram: r.instagram,
  offersPersonalTraining: r.offers_personal_training,
  photoUrl: r.photo_path && media ? media.url(r.photo_path) : null,
});

async function trainerAdmin(
  tx: Tx,
  id: string,
  locale: string,
  media?: MediaStore,
): Promise<TrainerAdminDto> {
  const [row] = await trainerRows(tx, locale, { id, publicOnly: false });
  if (!row) throw notFound('trainer');
  const extra = await tx
    .selectFrom('trainers')
    .select(['is_public', 'archived_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  const tr = await tx
    .selectFrom('trainer_translations')
    .selectAll()
    .where('trainer_id', '=', id)
    .execute();
  return {
    ...toTrainerDto(row, media),
    isPublic: extra.is_public,
    sortOrder: row.sort_order,
    archivedAt: extra.archived_at ? new Date(extra.archived_at).toISOString() : null,
    translations: Object.fromEntries(tr.map((t) => [t.locale, { title: t.title, bio: t.bio }])),
  };
}

async function writeTrainerTranslations(
  tx: Tx,
  id: string,
  translations: UpdateTrainerBody['translations'],
) {
  for (const [locale, t] of Object.entries(translations ?? {})) {
    if (!t) continue;
    const values = { title: t.title ?? null, bio: t.bio ?? null };
    await tx
      .insertInto('trainer_translations')
      .values({ trainer_id: id, locale, ...values })
      .onConflict((oc) => oc.columns(['trainer_id', 'locale']).doUpdateSet(values))
      .execute();
  }
}

const trainerColumns = (b: UpdateTrainerBody) => ({
  ...(b.firstName !== undefined && { first_name: b.firstName }),
  ...(b.lastName !== undefined && { last_name: b.lastName }),
  ...(b.instagram !== undefined && { instagram: b.instagram }),
  ...(b.isPublic !== undefined && { is_public: b.isPublic }),
  ...(b.offersPersonalTraining !== undefined && {
    offers_personal_training: b.offersPersonalTraining,
  }),
  ...(b.sortOrder !== undefined && { sort_order: b.sortOrder }),
});

// ── Class types ───────────────────────────────────────────────────────────────
async function classTypes(
  tx: Tx,
  locale: string,
  opts: { id?: string; withTranslations?: boolean } = {},
): Promise<ClassTypeDto[]> {
  let q = tx
    .selectFrom('class_types as ct')
    .innerJoin('zones as z', 'z.id', 'ct.zone_id')
    .leftJoin('class_type_translations as t', (j) =>
      j.onRef('t.class_type_id', '=', 'ct.id').on('t.locale', '=', locale),
    )
    .leftJoin('class_type_translations as tsr', (j) =>
      j.onRef('tsr.class_type_id', '=', 'ct.id').on('tsr.locale', '=', 'sr'),
    )
    .select([
      'ct.id',
      'ct.key',
      'z.key as zone',
      'ct.color',
      'ct.default_duration_min',
      'ct.default_capacity',
      'ct.is_active',
      'ct.sort_order',
      (eb) => eb.fn.coalesce('t.name', 'tsr.name').as('name'),
      (eb) => eb.fn.coalesce('t.description', 'tsr.description').as('description'),
    ])
    .orderBy('ct.sort_order');
  if (opts.id) q = q.where('ct.id', '=', opts.id);
  const rows = await q.execute();
  const translations = opts.withTranslations
    ? await tx.selectFrom('class_type_translations').selectAll().execute()
    : [];
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    zone: r.zone,
    color: r.color,
    defaultDurationMin: r.default_duration_min,
    defaultCapacity: r.default_capacity,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    name: r.name ?? r.key,
    description: r.description,
    ...(opts.withTranslations && {
      translations: Object.fromEntries(
        translations
          .filter((t) => t.class_type_id === r.id)
          .map((t) => [t.locale, { name: t.name, description: t.description }]),
      ),
    }),
  }));
}

async function zoneId(tx: Tx, key: string) {
  const z = await tx.selectFrom('zones').select('id').where('key', '=', key).executeTakeFirst();
  if (!z) throw invalid('zone', 'validation.invalid_key');
  return z.id;
}

async function writeTypeTranslations(
  tx: Tx,
  id: string,
  translations: UpdateClassTypeBody['translations'],
) {
  for (const [locale, t] of Object.entries(translations ?? {})) {
    if (!t) continue;
    const values = { name: t.name, description: t.description ?? null };
    await tx
      .insertInto('class_type_translations')
      .values({ class_type_id: id, locale, ...values })
      .onConflict((oc) => oc.columns(['class_type_id', 'locale']).doUpdateSet(values))
      .execute();
  }
}

async function assertTrainer(tx: Tx, id: string | null | undefined) {
  if (!id) return;
  const t = await tx
    .selectFrom('trainers')
    .select('archived_at')
    .where('id', '=', id)
    .executeTakeFirst();
  if (!t || t.archived_at) throw invalid('trainerId', 'validation.invalid_id');
}

// ── Series ────────────────────────────────────────────────────────────────────
async function seriesList(tx: Tx, locale: string, id?: string): Promise<SeriesDto[]> {
  const rows = await sql<{
    id: string;
    class_type_id: string;
    type_name: string;
    color: string;
    trainer_id: string | null;
    trainer_name: string | null;
    weekday: number;
    start_time: string;
    duration_min: number;
    capacity: number;
    room_key: string | null;
    valid_from: string;
    valid_until: string | null;
  }>`
    select s.id, s.class_type_id, coalesce(t.name, tsr.name, ct.key) as type_name, ct.color,
           s.trainer_id, tr.first_name || ' ' || tr.last_name as trainer_name,
           s.weekday, to_char(s.start_time, 'HH24:MI') as start_time, s.duration_min, s.capacity,
           s.room_key, s.valid_from::text, s.valid_until::text
    from public.class_series s
    join public.class_types ct on ct.id = s.class_type_id
    left join public.class_type_translations t on t.class_type_id = ct.id and t.locale = ${locale}
    left join public.class_type_translations tsr on tsr.class_type_id = ct.id and tsr.locale = 'sr'
    left join public.trainers tr on tr.id = s.trainer_id
    where (${id ?? null}::uuid is null or s.id = ${id ?? null}::uuid)
    order by (s.valid_until is not null and s.valid_until < public.club_today()), s.weekday, s.start_time
  `
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    id: r.id,
    classTypeId: r.class_type_id,
    typeName: r.type_name,
    color: r.color,
    trainerId: r.trainer_id,
    trainerName: r.trainer_name,
    weekday: r.weekday,
    startTime: r.start_time,
    durationMin: r.duration_min,
    capacity: r.capacity,
    roomKey: r.room_key,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
  }));
}

/** Cancels a session and all its live bookings (no penalty for members). */
async function cancelSession(tx: Tx, classId: string, reason: string, byUserId: string) {
  await tx
    .updateTable('classes')
    .set({ status: 'cancelled', cancelled_reason: reason, cancelled_by: byUserId })
    .where('id', '=', classId)
    .execute();
  const res = await tx
    .updateTable('bookings')
    .set({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancelled_by: byUserId,
      late_cancel: false,
    })
    .where('class_id', '=', classId)
    .where('status', 'in', ['confirmed', 'waitlisted'])
    .returning('id')
    .execute();
  await notifyClassCancelled(
    tx,
    res.map((r) => r.id),
  );
  return res.length;
}

export function createScheduleService(db: Kysely<DB>, media?: MediaStore) {
  return {
    // Public ──────────────────────────────────────────────────────────────────
    publicSchedule: (locale: string, from: string, to: string, typeKey?: string) =>
      withStaffTx(db, async (tx) => {
        await ensureSessions(tx);
        const rules = await loadRules(tx);
        const rows = await querySessions(tx, locale, { from, to, typeKey });
        // Only active class types are public; cancelled sessions stay visible (members need to know).
        const activeTypes = new Set(
          (await classTypes(tx, locale)).filter((t) => t.isActive).map((t) => t.id),
        );
        return rows
          .filter((r) => activeTypes.has(r.class_type_id))
          .map((r) => toSessionDto(r, rules));
      }),

    publicTrainers: (locale: string) =>
      withAnonTx(db, async (tx) =>
        (await trainerRows(tx, locale, { publicOnly: true })).map((r) => toTrainerDto(r, media)),
      ),

    publicClassTypes: (locale: string) => withAnonTx(db, (tx) => classTypes(tx, locale)),

    // Trainers ────────────────────────────────────────────────────────────────
    listTrainers: (locale: string) =>
      withStaffTx(db, async (tx) => {
        const ids = await tx.selectFrom('trainers').select('id').orderBy('sort_order').execute();
        return Promise.all(ids.map((r) => trainerAdmin(tx, r.id, locale, media)));
      }),

    createTrainer: (actor: Actor, req: Request, b: CreateTrainerBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('trainers')
          .values({
            first_name: b.firstName,
            last_name: b.lastName,
            instagram: b.instagram ?? null,
            is_public: b.isPublic,
            offers_personal_training: b.offersPersonalTraining,
            sort_order: b.sortOrder,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeTrainerTranslations(tx, row.id, b.translations);
        await writeAudit(tx, actor, req, {
          action: 'trainer.create',
          entityType: 'trainer',
          entityId: row.id,
          diff: { after: { name: `${b.firstName} ${b.lastName}`, isPublic: b.isPublic } },
        });
        return trainerAdmin(tx, row.id, locale, media);
      }),

    updateTrainer: (actor: Actor, req: Request, id: string, b: UpdateTrainerBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('trainers')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('trainer');
        const set = {
          ...trainerColumns(b),
          ...(b.archived !== undefined && { archived_at: b.archived ? new Date() : null }),
        };
        if (Object.keys(set).length > 0)
          await tx.updateTable('trainers').set(set).where('id', '=', id).execute();
        await writeTrainerTranslations(tx, id, b.translations);
        await writeAudit(tx, actor, req, {
          action: 'trainer.update',
          entityType: 'trainer',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        return trainerAdmin(tx, id, locale, media);
      }),

    /** Replaces the trainer's photo (the old file is removed after the row is updated). */
    setTrainerPhoto: (
      actor: Actor,
      req: Request,
      id: string,
      image: string | null,
      locale: string,
    ) =>
      withStaffTx(db, async (tx) => {
        if (!media) throw new Error('media store not configured');
        const t = await tx
          .selectFrom('trainers')
          .select('photo_path')
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!t) throw notFound('trainer');
        let key: string | null = null;
        if (image) {
          const img = decodeImage(image);
          key = mediaKey('trainers', id, img.ext);
          await media.put(key, img.data, img.type);
        }
        await tx.updateTable('trainers').set({ photo_path: key }).where('id', '=', id).execute();
        await writeAudit(tx, actor, req, {
          action: image ? 'trainer.photo_set' : 'trainer.photo_remove',
          entityType: 'trainer',
          entityId: id,
          diff: { before: { photo: t.photo_path }, after: { photo: key } },
        });
        if (t.photo_path) await media.remove(t.photo_path).catch(() => undefined);
        return trainerAdmin(tx, id, locale, media);
      }),

    // Class types ─────────────────────────────────────────────────────────────
    listTypes: (locale: string) =>
      withStaffTx(db, (tx) => classTypes(tx, locale, { withTranslations: true })),

    createType: (actor: Actor, req: Request, b: CreateClassTypeBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('class_types')
          .values({
            key: b.key,
            zone_id: await zoneId(tx, b.zone),
            color: b.color,
            default_duration_min: b.defaultDurationMin,
            default_capacity: b.defaultCapacity,
            is_active: b.isActive,
            sort_order: b.sortOrder,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeTypeTranslations(tx, row.id, b.translations);
        await writeAudit(tx, actor, req, {
          action: 'class_type.create',
          entityType: 'class_type',
          entityId: row.id,
          diff: { after: { key: b.key, zone: b.zone } },
        });
        return (await classTypes(tx, locale, { id: row.id, withTranslations: true }))[0]!;
      }),

    updateType: (actor: Actor, req: Request, id: string, b: UpdateClassTypeBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('class_types')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('class_type');
        const set = {
          ...(b.zone !== undefined && { zone_id: await zoneId(tx, b.zone) }),
          ...(b.color !== undefined && { color: b.color }),
          ...(b.defaultDurationMin !== undefined && { default_duration_min: b.defaultDurationMin }),
          ...(b.defaultCapacity !== undefined && { default_capacity: b.defaultCapacity }),
          ...(b.isActive !== undefined && { is_active: b.isActive }),
          ...(b.sortOrder !== undefined && { sort_order: b.sortOrder }),
        };
        if (Object.keys(set).length > 0)
          await tx.updateTable('class_types').set(set).where('id', '=', id).execute();
        await writeTypeTranslations(tx, id, b.translations);
        await writeAudit(tx, actor, req, {
          action: 'class_type.update',
          entityType: 'class_type',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        return (await classTypes(tx, locale, { id, withTranslations: true }))[0]!;
      }),

    // Weekly series ───────────────────────────────────────────────────────────
    listSeries: (locale: string) => withStaffTx(db, (tx) => seriesList(tx, locale)),

    createSeries: (actor: Actor, req: Request, b: CreateSeriesBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        await assertTrainer(tx, b.trainerId);
        const today = await sql<{ d: string }>`select public.club_today()::text as d`
          .execute(tx)
          .then((r) => r.rows[0]!.d);
        const row = await tx
          .insertInto('class_series')
          .values({
            class_type_id: b.classTypeId,
            trainer_id: b.trainerId ?? null,
            weekday: b.weekday,
            start_time: b.startTime,
            duration_min: b.durationMin,
            capacity: b.capacity,
            room_key: b.roomKey ?? null,
            valid_from: b.validFrom ?? today,
            valid_until: b.validUntil ?? null,
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await ensureSessions(tx, true);
        await writeAudit(tx, actor, req, {
          action: 'class_series.create',
          entityType: 'class_series',
          entityId: row.id,
          diff: { after: { ...b } },
        });
        return (await seriesList(tx, locale, row.id))[0]!;
      }),

    /**
     * Applies trainer / room / capacity to upcoming sessions of the series. Ending the series
     * (validUntil) removes later sessions without bookings and cancels those with bookings.
     */
    updateSeries: (actor: Actor, req: Request, id: string, b: UpdateSeriesBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('class_series')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('class_series');
        await assertTrainer(tx, b.trainerId);
        if (b.validUntil && b.validUntil < before.valid_from)
          throw invalid('validUntil', 'validation.date_order');
        const set = {
          ...(b.trainerId !== undefined && { trainer_id: b.trainerId }),
          ...(b.capacity !== undefined && { capacity: b.capacity }),
          ...(b.roomKey !== undefined && { room_key: b.roomKey }),
          ...(b.validUntil !== undefined && { valid_until: b.validUntil }),
        };
        if (Object.keys(set).length > 0)
          await tx.updateTable('class_series').set(set).where('id', '=', id).execute();

        const upcoming = await tx
          .selectFrom('classes')
          .select(['id', 'starts_at'])
          .where('series_id', '=', id)
          .where('status', '=', 'scheduled')
          .where('starts_at', '>', new Date())
          .forUpdate()
          .execute();
        let skippedCapacity = 0;
        for (const c of upcoming) {
          const day = await sql<{ d: string }>`
            select ((${new Date(c.starts_at).toISOString()}::timestamptz) at time zone 'Europe/Belgrade')::date::text as d`
            .execute(tx)
            .then((r) => r.rows[0]!.d);
          if (b.validUntil && day > b.validUntil) {
            const live = await tx
              .selectFrom('bookings')
              .select('id')
              .where('class_id', '=', c.id)
              .where('status', '<>', 'cancelled')
              .executeTakeFirst();
            if (live) await cancelSession(tx, c.id, 'series_ended', actor.userId);
            else await tx.deleteFrom('classes').where('id', '=', c.id).execute();
            continue;
          }
          const upd = {
            ...(b.trainerId !== undefined && { trainer_id: b.trainerId }),
            ...(b.roomKey !== undefined && { room_key: b.roomKey }),
          };
          if (b.capacity !== undefined) {
            const taken = await tx
              .selectFrom('bookings')
              .select((eb) => eb.fn.countAll<string>().as('n'))
              .where('class_id', '=', c.id)
              .where('status', 'in', ['confirmed', 'attended', 'no_show'])
              .executeTakeFirstOrThrow();
            if (Number(taken.n) <= b.capacity) Object.assign(upd, { capacity: b.capacity });
            else skippedCapacity += 1;
          }
          if (Object.keys(upd).length > 0)
            await tx.updateTable('classes').set(upd).where('id', '=', c.id).execute();
          if (b.capacity !== undefined) await promoteWaitlist(tx, c.id);
        }
        await ensureSessions(tx, true);
        await writeAudit(tx, actor, req, {
          action: 'class_series.update',
          entityType: 'class_series',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        return { series: (await seriesList(tx, locale, id))[0]!, skippedCapacity };
      }),

    // Sessions ────────────────────────────────────────────────────────────────
    adminSchedule: (locale: string, from: string, to: string) =>
      withStaffTx(db, async (tx) => {
        await ensureSessions(tx);
        const rules = await loadRules(tx);
        return (await querySessions(tx, locale, { from, to })).map((r) => toAdminDto(r, rules));
      }),

    createClass: (actor: Actor, req: Request, b: CreateClassBody, locale: string) =>
      withStaffTx(db, async (tx): Promise<ClassAdminDto> => {
        await assertTrainer(tx, b.trainerId);
        const startsAt = new Date(b.startsAt);
        const row = await tx
          .insertInto('classes')
          .values({
            class_type_id: b.classTypeId,
            trainer_id: b.trainerId ?? null,
            starts_at: startsAt,
            ends_at: new Date(startsAt.getTime() + b.durationMin * 60_000),
            capacity: b.capacity,
            room_key: b.roomKey ?? null,
            note: b.note ?? null,
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'class.create',
          entityType: 'class',
          entityId: row.id,
          diff: { after: { ...b } },
        });
        const rules = await loadRules(tx);
        return toAdminDto((await querySessions(tx, locale, { ids: [row.id] }))[0]!, rules);
      }),

    updateClass: (actor: Actor, req: Request, id: string, b: UpdateClassBody, locale: string) =>
      withStaffTx(db, async (tx): Promise<ClassAdminDto> => {
        const before = await tx
          .selectFrom('classes')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('class');
        if (before.status === 'cancelled')
          throw new AppError('BUSINESS_RULE', 'errors.booking.class_cancelled');
        await assertTrainer(tx, b.trainerId);
        const start = b.startsAt ? new Date(b.startsAt) : new Date(before.starts_at);
        const startChanged = start.getTime() !== new Date(before.starts_at).getTime();
        // Series sessions keep their slot so regeneration never duplicates them.
        if (startChanged && before.series_id)
          throw new AppError('BUSINESS_RULE', 'errors.class.series_time_locked');
        const timeChanged = startChanged || b.durationMin !== undefined;
        if (b.capacity !== undefined) {
          const taken = await tx
            .selectFrom('bookings')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('class_id', '=', id)
            .where('status', 'in', ['confirmed', 'attended', 'no_show'])
            .executeTakeFirstOrThrow();
          if (Number(taken.n) > b.capacity)
            throw new AppError('BUSINESS_RULE', 'errors.class.capacity_below_booked', [
              { booked: Number(taken.n) },
            ]);
        }
        const duration =
          b.durationMin ??
          (new Date(before.ends_at).getTime() - new Date(before.starts_at).getTime()) / 60_000;
        const set = {
          ...(b.trainerId !== undefined && { trainer_id: b.trainerId }),
          ...(b.capacity !== undefined && { capacity: b.capacity }),
          ...(b.roomKey !== undefined && { room_key: b.roomKey }),
          ...(b.note !== undefined && { note: b.note }),
          ...(timeChanged && {
            starts_at: start,
            ends_at: new Date(start.getTime() + duration * 60_000),
          }),
        };
        if (Object.keys(set).length > 0)
          await tx.updateTable('classes').set(set).where('id', '=', id).execute();
        if (b.capacity !== undefined) await promoteWaitlist(tx, id);
        await writeAudit(tx, actor, req, {
          action: 'class.update',
          entityType: 'class',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        const rules = await loadRules(tx);
        return toAdminDto((await querySessions(tx, locale, { ids: [id] }))[0]!, rules);
      }),

    cancelClass: (actor: Actor, req: Request, id: string, reason: string) =>
      withStaffTx(db, async (tx) => {
        const c = await tx
          .selectFrom('classes')
          .select(['status'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!c) throw notFound('class');
        if (c.status === 'cancelled')
          throw new AppError('CONFLICT', 'errors.class.already_cancelled');
        const cancelledBookings = await cancelSession(tx, id, reason, actor.userId);
        await writeAudit(tx, actor, req, {
          action: 'class.cancel',
          entityType: 'class',
          entityId: id,
          diff: { after: { reason, cancelledBookings } },
        });
        return { cancelledBookings };
      }),
  };
}
