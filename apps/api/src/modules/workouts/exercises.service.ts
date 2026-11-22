import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  CreateExerciseBody,
  ExerciseDetailDto,
  ExerciseDto,
  ExerciseTracking,
  MuscleGroupDto,
  UpdateExerciseBody,
} from '@grit/validation';
import { withAnonTx, withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

interface Row {
  id: string;
  key: string;
  category: ExerciseDto['category'];
  tracking: ExerciseTracking;
  name: string | null;
  instructions: string | null;
  video_url: string | null;
  equipment_category_key: string | null;
  is_active: boolean;
  muscles: Array<{ key: string; name: string; primary: boolean }> | null;
}

/** Localized library query; runs as anon (public) or on the staff connection (admin). */
export async function queryExercises(
  tx: Tx,
  locale: string,
  f: { id?: string; ids?: string[]; q?: string; category?: string; muscle?: string; all?: boolean },
): Promise<ExerciseDto[]> {
  if (f.ids && f.ids.length === 0) return [];
  const term = f.q ? `%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await sql<Row>`
    select e.id, e.key, e.category, e.tracking::text as tracking,
           coalesce(t.name, tsr.name) as name, coalesce(t.instructions, tsr.instructions) as instructions,
           e.video_url, ec.key as equipment_category_key, e.is_active,
           (select json_agg(json_build_object('key', g.key, 'name', coalesce(gt.name, gts.name, g.key),
                                              'primary', m.is_primary)
                            order by m.is_primary desc, g.sort_order)
            from public.exercise_muscle_groups m
            join public.muscle_groups g on g.id = m.muscle_group_id
            left join public.muscle_group_translations gt on gt.muscle_group_id = g.id and gt.locale = ${locale}
            left join public.muscle_group_translations gts on gts.muscle_group_id = g.id and gts.locale = 'sr'
            where m.exercise_id = e.id) as muscles
    from public.exercises e
    left join public.exercise_translations t on t.exercise_id = e.id and t.locale = ${locale}
    left join public.exercise_translations tsr on tsr.exercise_id = e.id and tsr.locale = 'sr'
    left join public.equipment_categories ec on ec.id = e.equipment_category_id
    where (${f.all ?? false} or e.is_active)
      and (${f.id ?? null}::uuid is null or e.id = ${f.id ?? null}::uuid)
      and (${f.ids ? sql`e.id in (${sql.join(f.ids)})` : sql`true`})
      and (${f.category ?? null}::text is null or e.category = ${f.category ?? null})
      and (${term}::text is null or lower(coalesce(t.name, tsr.name)) like ${term}
           or lower(tsr.name) like ${term} or e.key like ${term})
      and (${f.muscle ?? null}::text is null or exists (
            select 1 from public.exercise_muscle_groups m join public.muscle_groups g on g.id = m.muscle_group_id
            where m.exercise_id = e.id and g.key = ${f.muscle ?? null}))
    order by coalesce(t.name, tsr.name)
  `
    .execute(tx)
    .then((r) => r.rows);
  // Sort in JS with the locale's collation: the database collation would put č/ć/š/ž after z.
  const collator = new Intl.Collator(locale === 'sr' ? 'sr-Latn' : locale);
  rows.sort((x, y) => collator.compare(x.name ?? x.key, y.name ?? y.key));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    category: r.category,
    tracking: r.tracking,
    name: r.name ?? r.key,
    instructions: r.instructions,
    videoUrl: r.video_url,
    equipmentCategoryKey: r.equipment_category_key,
    muscles: r.muscles ?? [],
    isActive: r.is_active,
  }));
}

/** Machines in the club linked to the exercise, with their room on the published map. */
async function machines(tx: Tx, exerciseId: string, locale: string) {
  return sql<{ id: string; name: string; room_name: string | null }>`
    select e.id, coalesce(t.name, tsr.name, '-') as name, loc.room_name
    from public.equipment_exercises ee
    join public.equipment e on e.id = ee.equipment_id and e.archived_at is null
    left join public.equipment_translations t on t.equipment_id = e.id and t.locale = ${locale}
    left join public.equipment_translations tsr on tsr.equipment_id = e.id and tsr.locale = 'sr'
    left join lateral (
      select coalesce(rt.name, rts.name) as room_name
      from public.equipment_placements p
      join public.rooms r on r.id = p.room_id and not r.is_hidden
      join public.floors f on f.id = r.floor_id
      join public.map_versions v on v.id = f.map_version_id and v.status = 'published'
      left join public.room_translations rt on rt.room_id = r.id and rt.locale = ${locale}
      left join public.room_translations rts on rts.room_id = r.id and rts.locale = 'sr'
      where p.equipment_id = e.id limit 1
    ) loc on true
    where ee.exercise_id = ${exerciseId}
    order by 2
  `
    .execute(tx)
    .then((r) => r.rows.map((m) => ({ id: m.id, name: m.name, roomName: m.room_name })));
}

async function writeDetails(tx: Tx, id: string, b: UpdateExerciseBody) {
  for (const [locale, t] of Object.entries(b.translations ?? {})) {
    if (!t) continue;
    const values = { name: t.name, instructions: t.instructions ?? null };
    await tx
      .insertInto('exercise_translations')
      .values({ exercise_id: id, locale, ...values })
      .onConflict((oc) => oc.columns(['exercise_id', 'locale']).doUpdateSet(values))
      .execute();
  }
  if (b.muscles) {
    const groups = await tx
      .selectFrom('muscle_groups')
      .select(['id', 'key'])
      .where('key', 'in', b.muscles)
      .execute();
    if (groups.length !== new Set(b.muscles).size)
      throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
        { path: 'muscles', message: 'validation.invalid_key' },
      ]);
    await tx.deleteFrom('exercise_muscle_groups').where('exercise_id', '=', id).execute();
    await tx
      .insertInto('exercise_muscle_groups')
      .values(
        b.muscles.map((key, i) => ({
          exercise_id: id,
          muscle_group_id: groups.find((g) => g.key === key)!.id,
          is_primary: i === 0,
        })),
      )
      .execute();
  }
  if (b.equipmentIds) {
    await tx.deleteFrom('equipment_exercises').where('exercise_id', '=', id).execute();
    if (b.equipmentIds.length > 0)
      await tx
        .insertInto('equipment_exercises')
        .values(
          [...new Set(b.equipmentIds)].map((equipment_id) => ({ equipment_id, exercise_id: id })),
        )
        .execute();
  }
}

async function equipmentCategoryId(tx: Tx, key: string | null | undefined) {
  if (!key) return null;
  const c = await tx
    .selectFrom('equipment_categories')
    .select('id')
    .where('key', '=', key)
    .executeTakeFirst();
  if (!c)
    throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
      { path: 'equipmentCategoryKey', message: 'validation.invalid_key' },
    ]);
  return c.id;
}

async function adminDetail(tx: Tx, id: string, locale: string): Promise<ExerciseDetailDto> {
  const [e] = await queryExercises(tx, locale, { id, all: true });
  if (!e) throw notFound('exercise');
  const tr = await tx
    .selectFrom('exercise_translations')
    .selectAll()
    .where('exercise_id', '=', id)
    .execute();
  const eq = await tx
    .selectFrom('equipment_exercises')
    .select('equipment_id')
    .where('exercise_id', '=', id)
    .execute();
  return {
    ...e,
    machines: await machines(tx, id, locale),
    translations: Object.fromEntries(
      tr.map((t) => [t.locale, { name: t.name, instructions: t.instructions }]),
    ),
    equipmentIds: eq.map((x) => x.equipment_id),
  };
}

export function createExerciseService(db: Kysely<DB>) {
  return {
    list: (locale: string, f: { q?: string; category?: string; muscle?: string }) =>
      withAnonTx(db, (tx) => queryExercises(tx, locale, f)),

    get: (locale: string, id: string): Promise<ExerciseDetailDto> =>
      withAnonTx(db, async (tx) => {
        const [e] = await queryExercises(tx, locale, { id });
        if (!e) throw notFound('exercise');
        return { ...e, machines: await machines(tx, id, locale) };
      }),

    muscleGroups: (locale: string): Promise<MuscleGroupDto[]> =>
      withAnonTx(db, (tx) =>
        sql<MuscleGroupDto>`
          select g.key, coalesce(t.name, ts.name, g.key) as name from public.muscle_groups g
          left join public.muscle_group_translations t on t.muscle_group_id = g.id and t.locale = ${locale}
          left join public.muscle_group_translations ts on ts.muscle_group_id = g.id and ts.locale = 'sr'
          order by g.sort_order`
          .execute(tx)
          .then((r) => r.rows),
      ),

    adminList: (locale: string) =>
      withStaffTx(db, (tx) => queryExercises(tx, locale, { all: true })),
    adminGet: (locale: string, id: string) => withStaffTx(db, (tx) => adminDetail(tx, id, locale)),

    create: (actor: Actor, req: Request, b: CreateExerciseBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('exercises')
          .values({
            key: b.key,
            category: b.category,
            tracking: b.tracking,
            equipment_category_id: await equipmentCategoryId(tx, b.equipmentCategoryKey),
            video_url: b.videoUrl ?? null,
            is_active: b.isActive,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeDetails(tx, row.id, b);
        await writeAudit(tx, actor, req, {
          action: 'exercise.create',
          entityType: 'exercise',
          entityId: row.id,
          diff: { after: { key: b.key, category: b.category } },
        });
        return adminDetail(tx, row.id, locale);
      }),

    update: (actor: Actor, req: Request, id: string, b: UpdateExerciseBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('exercises')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('exercise');
        const set = {
          ...(b.category !== undefined && { category: b.category }),
          ...(b.tracking !== undefined && { tracking: b.tracking }),
          ...(b.equipmentCategoryKey !== undefined && {
            equipment_category_id: await equipmentCategoryId(tx, b.equipmentCategoryKey),
          }),
          ...(b.videoUrl !== undefined && { video_url: b.videoUrl }),
          ...(b.isActive !== undefined && { is_active: b.isActive }),
        };
        if (Object.keys(set).length > 0)
          await tx.updateTable('exercises').set(set).where('id', '=', id).execute();
        await writeDetails(tx, id, b);
        await writeAudit(tx, actor, req, {
          action: 'exercise.update',
          entityType: 'exercise',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        return adminDetail(tx, id, locale);
      }),
  };
}
