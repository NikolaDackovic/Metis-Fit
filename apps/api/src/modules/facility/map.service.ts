import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  EquipmentStatus,
  MapBackgroundDto,
  MapDto,
  RectShape,
  RoomStyle,
  SaveMapDraftBody,
} from '@grit/validation';
import { withAnonTx, withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { decodeImage, mediaKey, type MediaStore } from '../../shared/media';

const pick = (m: Record<string, string | null>, locale: string) =>
  m[locale] ?? m.sr ?? Object.values(m)[0] ?? '';

/** "club.map_visible" (default true): the owner can hide the whole map from members. */
async function mapVisible(tx: Tx): Promise<boolean> {
  const row = await tx
    .selectFrom('settings')
    .select('value')
    .where('key', '=', 'club.map_visible')
    .executeTakeFirst();
  return row?.value !== false;
}

/** Builds the map DTO for one version. Under anon RLS hidden rooms and archived equipment are invisible. */
export async function loadMap(
  tx: Tx,
  versionId: string,
  locale: string,
  media: MediaStore,
): Promise<MapDto> {
  const version = await tx
    .selectFrom('map_versions')
    .selectAll()
    .where('id', '=', versionId)
    .executeTakeFirstOrThrow();
  const floors = await tx
    .selectFrom('floors')
    .selectAll()
    .where('map_version_id', '=', versionId)
    .orderBy('sort_order')
    .orderBy('level', 'desc')
    .execute();
  const floorIds = floors.map((f) => f.id);
  const [floorNames, rooms] = await Promise.all([
    floorIds.length
      ? tx.selectFrom('floor_translations').selectAll().where('floor_id', 'in', floorIds).execute()
      : Promise.resolve([]),
    floorIds.length
      ? tx.selectFrom('rooms').selectAll().where('floor_id', 'in', floorIds).execute()
      : Promise.resolve([]),
  ]);
  const roomIds = rooms.map((r) => r.id);
  const [roomTexts, placements] = await Promise.all([
    roomIds.length
      ? tx.selectFrom('room_translations').selectAll().where('room_id', 'in', roomIds).execute()
      : Promise.resolve([]),
    roomIds.length
      ? sql<{
          room_id: string;
          equipment_id: string;
          x: string;
          y: string;
          status: EquipmentStatus;
          category_key: string;
          name: string | null;
        }>`
          select p.room_id, p.equipment_id, p.x, p.y, e.status::text as status, c.key as category_key,
                 coalesce(t.name, tsr.name) as name
          from public.equipment_placements p
          join public.equipment e on e.id = p.equipment_id
          join public.equipment_categories c on c.id = e.category_id
          left join public.equipment_translations t on t.equipment_id = e.id and t.locale = ${locale}
          left join public.equipment_translations tsr on tsr.equipment_id = e.id and tsr.locale = 'sr'
          where p.room_id in (${sql.join(roomIds)})
        `
          .execute(tx)
          .then((r) => r.rows)
      : Promise.resolve([]),
  ]);

  return {
    versionId: version.id,
    version: version.version,
    revision: version.revision,
    isSchematic: version.is_schematic,
    publishedAt: version.published_at ? new Date(version.published_at).toISOString() : null,
    // Draft only: saved changes that members do not see until the map is published.
    unpublishedChanges:
      version.status === 'draft' && version.revision > (version.published_revision ?? 1),
    visibleToMembers: await mapVisible(tx),
    floors: floors.map((f) => {
      const names = Object.fromEntries(
        floorNames.filter((n) => n.floor_id === f.id).map((n) => [n.locale, n.name]),
      );
      return {
        key: f.key,
        level: f.level,
        width: Number(f.width),
        height: Number(f.height),
        name: pick(names, locale),
        names,
        backgroundPath: f.background_path,
        backgroundUrl: f.background_path ? media.url(f.background_path) : null,
        backgroundOpacity: Number(f.background_opacity),
        roomStyle: f.room_style as RoomStyle,
        rooms: rooms
          .filter((r) => r.floor_id === f.id)
          .map((r) => {
            const texts = roomTexts.filter((t) => t.room_id === r.id);
            const rn = Object.fromEntries(texts.map((t) => [t.locale, t.name]));
            const rd = Object.fromEntries(texts.map((t) => [t.locale, t.description]));
            return {
              key: r.key,
              type: r.type,
              shape: r.shape as unknown as RectShape,
              name: pick(rn, locale),
              names: rn,
              description: rd[locale] ?? rd.sr ?? null,
              descriptions: rd,
              isHidden: r.is_hidden,
              isUnavailable: r.is_unavailable,
              unavailableNote: r.unavailable_note,
              placements: placements
                .filter((p) => p.room_id === r.id)
                .map((p) => ({
                  equipmentId: p.equipment_id,
                  x: Number(p.x),
                  y: Number(p.y),
                  name: p.name ?? '-',
                  status: p.status,
                  categoryKey: p.category_key,
                })),
            };
          }),
      };
    }),
  };
}

export function createMapService(db: Kysely<DB>, media: MediaStore) {
  return {
    /** Published map for members and guests (null until something has been published). */
    getPublished: (locale: string) =>
      withAnonTx(db, async (tx) => {
        const v = await tx
          .selectFrom('map_versions')
          .select('id')
          .where('status', '=', 'published')
          .executeTakeFirst();
        if (!v || !(await mapVisible(tx))) return null;
        return loadMap(tx, v.id, locale, media);
      }),

    /** The editor's working copy. Created from the published version (or empty) on first use. */
    getDraft: (locale: string) =>
      withStaffTx(db, async (tx) => {
        let draft = await tx
          .selectFrom('map_versions')
          .select('id')
          .where('status', '=', 'draft')
          .executeTakeFirst();
        if (!draft) {
          const published = await tx
            .selectFrom('map_versions')
            .select('id')
            .where('status', '=', 'published')
            .executeTakeFirst();
          if (published) {
            const { rows } = await sql<{ id: string }>`
              select public.clone_map_version(${published.id}, 'draft') as id`.execute(tx);
            draft = { id: rows[0]!.id };
          } else {
            draft = await tx
              .insertInto('map_versions')
              .values({
                version: sql<number>`(select coalesce(max(version), 0) + 1 from public.map_versions)`,
                status: 'draft',
              })
              .returning('id')
              .executeTakeFirstOrThrow();
          }
        }
        return loadMap(tx, draft.id, locale, media);
      }),

    async saveDraft(
      actor: Actor,
      req: Request,
      body: SaveMapDraftBody,
      locale: string,
    ): Promise<MapDto> {
      return withStaffTx(db, async (tx) => {
        const draft = await tx
          .selectFrom('map_versions')
          .select(['id', 'revision'])
          .where('status', '=', 'draft')
          .forUpdate()
          .executeTakeFirst();
        if (!draft) throw new AppError('CONFLICT', 'errors.map.no_draft');
        if (draft.revision !== body.revision)
          throw new AppError('CONFLICT', 'errors.map.stale_revision');

        const equipmentIds = [
          ...new Set(
            body.floors.flatMap((f) =>
              f.rooms.flatMap((r) => r.placements.map((p) => p.equipmentId)),
            ),
          ),
        ];
        if (equipmentIds.length) {
          const found = await tx
            .selectFrom('equipment')
            .select('id')
            .where('id', 'in', equipmentIds)
            .where('archived_at', 'is', null)
            .execute();
          if (found.length !== equipmentIds.length)
            throw new AppError('BUSINESS_RULE', 'errors.map.unknown_equipment');
        }

        // Replace the draft content atomically. Equipment rows themselves are never touched.
        await tx.deleteFrom('floors').where('map_version_id', '=', draft.id).execute();
        for (const [fi, f] of body.floors.entries()) {
          const floor = await tx
            .insertInto('floors')
            .values({
              map_version_id: draft.id,
              key: f.key,
              level: f.level,
              width: f.width,
              height: f.height,
              sort_order: fi,
              background_path: f.backgroundPath,
              background_opacity: f.backgroundOpacity,
              room_style: f.roomStyle,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await tx
            .insertInto('floor_translations')
            .values(
              Object.entries(f.names)
                .filter(([, n]) => n)
                .map(([locale, name]) => ({ floor_id: floor.id, locale, name: name! })),
            )
            .execute();
          for (const r of f.rooms) {
            const room = await tx
              .insertInto('rooms')
              .values({
                floor_id: floor.id,
                key: r.key,
                type: r.type,
                shape: JSON.stringify(r.shape),
                is_hidden: r.isHidden,
                is_unavailable: r.isUnavailable,
                unavailable_note: r.unavailableNote ?? null,
              })
              .returning('id')
              .executeTakeFirstOrThrow();
            await tx
              .insertInto('room_translations')
              .values(
                Object.entries(r.names)
                  .filter(([, n]) => n)
                  .map(([locale, name]) => ({
                    room_id: room.id,
                    locale,
                    name: name!,
                    description: r.descriptions[locale as 'sr'] ?? null,
                  })),
              )
              .execute();
            if (r.placements.length) {
              await tx
                .insertInto('equipment_placements')
                .values(
                  r.placements.map((p) => ({
                    room_id: room.id,
                    equipment_id: p.equipmentId,
                    x: p.x,
                    y: p.y,
                  })),
                )
                .execute();
            }
          }
        }
        await tx
          .updateTable('map_versions')
          .set({ revision: draft.revision + 1, is_schematic: body.isSchematic })
          .where('id', '=', draft.id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'map.save_draft',
          entityType: 'map_version',
          entityId: draft.id,
          diff: {
            after: {
              floors: body.floors.length,
              rooms: body.floors.reduce((s, f) => s + f.rooms.length, 0),
              revision: draft.revision + 1,
            },
          },
        });
        return loadMap(tx, draft.id, locale, media);
      });
    },

    /** Snapshot the draft as the new published version; the previous one is archived (history). */
    async publish(actor: Actor, req: Request, locale: string): Promise<MapDto> {
      return withStaffTx(db, async (tx) => {
        const draft = await tx
          .selectFrom('map_versions')
          .select(['id', 'revision'])
          .where('status', '=', 'draft')
          .forUpdate()
          .executeTakeFirst();
        if (!draft) throw new AppError('CONFLICT', 'errors.map.no_draft');
        const floors = await tx
          .selectFrom('floors')
          .select('id')
          .where('map_version_id', '=', draft.id)
          .execute();
        if (!floors.length) throw new AppError('BUSINESS_RULE', 'errors.map.empty');

        await tx
          .updateTable('map_versions')
          .set({ status: 'archived' })
          .where('status', '=', 'published')
          .execute();
        const { rows } = await sql<{ id: string }>`
          select public.clone_map_version(${draft.id}, 'published') as id`.execute(tx);
        const publishedId = rows[0]!.id;
        await tx
          .updateTable('map_versions')
          .set({ published_at: new Date(), published_by: actor.userId })
          .where('id', '=', publishedId)
          .execute();
        // The draft now matches what members see.
        await tx
          .updateTable('map_versions')
          .set({ published_revision: draft.revision })
          .where('id', '=', draft.id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'map.publish',
          entityType: 'map_version',
          entityId: publishedId,
          diff: null,
        });
        return loadMap(tx, publishedId, locale, media);
      });
    },

    /** Stores a floor background image; the editor puts the returned path into the draft. */
    async uploadBackground(actor: Actor, req: Request, image: string): Promise<MapBackgroundDto> {
      const img = decodeImage(image);
      const key = mediaKey('map', 'floor', img.ext);
      await media.put(key, img.data, img.type);
      await withStaffTx(db, (tx) =>
        writeAudit(tx, actor, req, {
          action: 'map.background_upload',
          entityType: 'map_version',
          entityId: null,
          diff: { after: { path: key } },
        }),
      );
      return { path: key, url: media.url(key) };
    },

    /** Shows or hides the whole map in the member app (the editor keeps working). */
    setVisibility: (actor: Actor, req: Request, visible: boolean) =>
      withStaffTx(db, async (tx) => {
        const v = JSON.stringify(visible);
        await tx
          .insertInto('settings')
          .values({ key: 'club.map_visible', value: v, updated_by: actor.userId })
          .onConflict((oc) =>
            oc.columns(['club_id', 'key']).doUpdateSet({ value: v, updated_by: actor.userId }),
          )
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'map.visibility',
          entityType: 'settings',
          entityId: null,
          diff: { after: { visible } },
        });
        return { visible };
      }),

    versions: () =>
      withStaffTx(db, (tx) =>
        tx
          .selectFrom('map_versions as v')
          .leftJoin('profiles as p', 'p.id', 'v.published_by')
          .select([
            'v.id',
            'v.version',
            'v.status',
            'v.published_at',
            sql<string | null>`nullif(trim(p.first_name || ' ' || p.last_name), '')`.as(
              'published_by_name',
            ),
          ])
          .where('v.status', '!=', 'draft')
          .orderBy('v.version', 'desc')
          .limit(50)
          .execute(),
      ),
  };
}
