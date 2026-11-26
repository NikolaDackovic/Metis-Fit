import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { ProgressPhotoBody, ProgressPhotoDto, ProgressPhotoFullDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { decodeImage } from '../../shared/media';

/**
 * F18-1 progress photos. Private by design: stored in the database (no public URL) and returned
 * as data URLs only to the owner, or to their active trainer for photos the member shared, while
 * progress sharing with that trainer is on.
 */
const MAX_PHOTOS = 120;
const THUMB_MAX = 150_000;
const notFound = () => new AppError('NOT_FOUND', 'errors.progress_photo.not_found');
const dataUrl = (type: string, b: Buffer) =>
  `data:${type};base64,${Buffer.from(b).toString('base64')}`;

type Row = {
  id: string;
  taken_on: unknown;
  pose: string;
  weight_kg: unknown;
  note: string | null;
  shared: boolean;
  content_type: string;
  thumb: Buffer;
};
const COLS = [
  'id',
  'taken_on',
  'pose',
  'weight_kg',
  'note',
  'shared',
  'content_type',
  'thumb',
] as const;
const toDto = (r: Row): ProgressPhotoDto => ({
  id: r.id,
  takenOn: String(r.taken_on).slice(0, 10),
  pose: r.pose as ProgressPhotoDto['pose'],
  weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
  note: r.note,
  shared: r.shared,
  thumb: dataUrl('image/jpeg', r.thumb),
});

async function canSeeClient(tx: Tx, actor: Actor, memberId: string) {
  const ok = await sql<{ ok: boolean }>`
    select public.trainer_can_view_progress(${actor.userId}, ${memberId}) as ok`
    .execute(tx)
    .then((r) => r.rows[0]!.ok);
  if (!ok) throw new AppError('FORBIDDEN', 'errors.progress.no_access');
  const m = await tx
    .selectFrom('members')
    .select('user_id')
    .where('id', '=', memberId)
    .executeTakeFirst();
  return m?.user_id ?? null;
}

export function createProgressPhotoService(db: Kysely<DB>) {
  const asUser = <T>(actor: Actor, fn: (tx: Tx, userId: string) => Promise<T>) =>
    withStaffTx(db, (tx) => fn(tx, actor.userId));

  return {
    list: (actor: Actor): Promise<ProgressPhotoDto[]> =>
      asUser(actor, async (tx, userId) =>
        (
          await tx
            .selectFrom('progress_photos')
            .select([...COLS])
            .where('user_id', '=', userId)
            .orderBy('taken_on', 'desc')
            .orderBy('created_at', 'desc')
            .limit(MAX_PHOTOS)
            .execute()
        ).map((r) => toDto(r as Row)),
      ),

    get: (actor: Actor, id: string): Promise<ProgressPhotoFullDto> =>
      asUser(actor, async (tx, userId) => {
        const r = await tx
          .selectFrom('progress_photos')
          .select([...COLS, 'image'])
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        if (!r) throw notFound();
        return { ...toDto(r as Row), image: dataUrl(r.content_type, r.image) };
      }),

    add: (actor: Actor, b: ProgressPhotoBody): Promise<ProgressPhotoDto> =>
      asUser(actor, async (tx, userId) => {
        const count = await tx
          .selectFrom('progress_photos')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('user_id', '=', userId)
          .executeTakeFirstOrThrow();
        if (Number(count.n) >= MAX_PHOTOS)
          throw new AppError('BUSINESS_RULE', 'errors.progress_photo.limit_reached');
        const img = decodeImage(b.image);
        const thumb = decodeImage(b.thumb);
        if (thumb.data.length > THUMB_MAX)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'thumb', message: 'validation.image_too_large' },
          ]);
        const r = await tx
          .insertInto('progress_photos')
          .values({
            user_id: userId,
            taken_on: b.takenOn,
            pose: b.pose,
            weight_kg: b.weightKg ?? null,
            note: b.note || null,
            shared: b.shared,
            content_type: img.type,
            image: img.data,
            thumb: thumb.data,
          })
          .returning([...COLS])
          .executeTakeFirstOrThrow();
        return toDto(r as Row);
      }),

    update: (
      actor: Actor,
      id: string,
      p: Partial<Pick<ProgressPhotoBody, 'takenOn' | 'pose' | 'weightKg' | 'note' | 'shared'>>,
    ): Promise<ProgressPhotoDto> =>
      asUser(actor, async (tx, userId) => {
        const r = await tx
          .updateTable('progress_photos')
          .set({
            ...(p.takenOn !== undefined && { taken_on: p.takenOn }),
            ...(p.pose !== undefined && { pose: p.pose }),
            ...(p.weightKg !== undefined && { weight_kg: p.weightKg }),
            ...(p.note !== undefined && { note: p.note || null }),
            ...(p.shared !== undefined && { shared: p.shared }),
          })
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .returning([...COLS])
          .executeTakeFirst();
        if (!r) throw notFound();
        return toDto(r as Row);
      }),

    remove: (actor: Actor, id: string) =>
      asUser(actor, async (tx, userId) => {
        const r = await tx
          .deleteFrom('progress_photos')
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .returning('id')
          .executeTakeFirst();
        if (!r) throw notFound();
        return { ok: true };
      }),

    /** Trainer: only the photos the client shared, only with progress sharing on. */
    forClient: (actor: Actor, req: Request, memberId: string): Promise<ProgressPhotoDto[]> =>
      withStaffTx(db, async (tx) => {
        const userId = await canSeeClient(tx, actor, memberId);
        if (!userId) return [];
        await writeAudit(tx, actor, req, {
          action: 'progress_photos.view',
          entityType: 'member',
          entityId: memberId,
        });
        return (
          await tx
            .selectFrom('progress_photos')
            .select([...COLS])
            .where('user_id', '=', userId)
            .where('shared', '=', true)
            .orderBy('taken_on', 'desc')
            .limit(MAX_PHOTOS)
            .execute()
        ).map((r) => toDto(r as Row));
      }),

    clientPhoto: (actor: Actor, memberId: string, id: string): Promise<ProgressPhotoFullDto> =>
      withStaffTx(db, async (tx) => {
        const userId = await canSeeClient(tx, actor, memberId);
        const r = userId
          ? await tx
              .selectFrom('progress_photos')
              .select([...COLS, 'image'])
              .where('id', '=', id)
              .where('user_id', '=', userId)
              .where('shared', '=', true)
              .executeTakeFirst()
          : undefined;
        if (!r) throw notFound();
        return { ...toDto(r as Row), image: dataUrl(r.content_type, r.image) };
      }),
  };
}
