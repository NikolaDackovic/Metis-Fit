import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  CreateEquipmentBody,
  EquipmentAdminDto,
  EquipmentDto,
  EquipmentStatus,
  MaintenanceDto,
  UpdateEquipmentBody,
} from '@grit/validation';
import { withAnonTx, withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

interface Row {
  id: string;
  category_key: string;
  category_name: string | null;
  name: string | null;
  description: string | null;
  usage_instructions: string | null;
  safety_notes: string | null;
  manufacturer: string | null;
  model: string | null;
  status: EquipmentStatus;
  video_url: string | null;
  floor_key: string | null;
  floor_name: string | null;
  room_key: string | null;
  room_name: string | null;
}

/** One localized query used for both the public catalogue (anon RLS) and admin lists. */
async function query(
  tx: Tx,
  locale: string,
  f: { id?: string; q?: string; category?: string; status?: string; includeArchived?: boolean },
) {
  const term = f.q ? `%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return sql<Row>`
    select e.id, c.key as category_key,
           coalesce(ct.name, cts.name) as category_name,
           coalesce(t.name, ts.name) as name,
           coalesce(t.description, ts.description) as description,
           coalesce(t.usage_instructions, ts.usage_instructions) as usage_instructions,
           coalesce(t.safety_notes, ts.safety_notes) as safety_notes,
           e.manufacturer, e.model, e.status::text as status, e.video_url,
           loc.floor_key, loc.floor_name, loc.room_key, loc.room_name
    from public.equipment e
    join public.equipment_categories c on c.id = e.category_id
    left join public.equipment_category_translations ct on ct.category_id = c.id and ct.locale = ${locale}
    left join public.equipment_category_translations cts on cts.category_id = c.id and cts.locale = 'sr'
    left join public.equipment_translations t on t.equipment_id = e.id and t.locale = ${locale}
    left join public.equipment_translations ts on ts.equipment_id = e.id and ts.locale = 'sr'
    left join lateral (
      select f.key as floor_key, coalesce(ft.name, fts.name) as floor_name,
             r.key as room_key, coalesce(rt.name, rts.name) as room_name
      from public.equipment_placements p
      join public.rooms r on r.id = p.room_id
      join public.floors f on f.id = r.floor_id
      join public.map_versions v on v.id = f.map_version_id and v.status = 'published'
      left join public.floor_translations ft on ft.floor_id = f.id and ft.locale = ${locale}
      left join public.floor_translations fts on fts.floor_id = f.id and fts.locale = 'sr'
      left join public.room_translations rt on rt.room_id = r.id and rt.locale = ${locale}
      left join public.room_translations rts on rts.room_id = r.id and rts.locale = 'sr'
      where p.equipment_id = e.id and not r.is_hidden
      limit 1
    ) loc on true
    where (${f.includeArchived ?? false} or e.archived_at is null)
      and (${f.id ?? null}::uuid is null or e.id = ${f.id ?? null}::uuid)
      and (${f.category ?? null}::text is null or c.key = ${f.category ?? null})
      and (${f.status ?? null}::text is null or e.status::text = ${f.status ?? null})
      and (${term}::text is null or lower(coalesce(t.name, ts.name)) like ${term})
    order by c.sort_order, coalesce(t.name, ts.name)
  `
    .execute(tx)
    .then((r) => r.rows);
}

const toDto = (r: Row): EquipmentDto => ({
  id: r.id,
  categoryKey: r.category_key,
  categoryName: r.category_name ?? r.category_key,
  name: r.name ?? '-',
  description: r.description,
  usageInstructions: r.usage_instructions,
  safetyNotes: r.safety_notes,
  manufacturer: r.manufacturer,
  model: r.model,
  status: r.status,
  videoUrl: r.video_url,
  location: r.room_key
    ? {
        floorKey: r.floor_key!,
        floorName: r.floor_name ?? '',
        roomKey: r.room_key,
        roomName: r.room_name ?? '',
      }
    : null,
});

async function adminDto(tx: Tx, id: string, locale: string): Promise<EquipmentAdminDto> {
  const [row] = await query(tx, locale, { id, includeArchived: true });
  if (!row) throw notFound('equipment');
  const extra = await tx
    .selectFrom('equipment')
    .select(['serial_number', 'asset_tag', 'purchased_on', 'archived_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  const translations = await tx
    .selectFrom('equipment_translations')
    .selectAll()
    .where('equipment_id', '=', id)
    .execute();
  const open = await tx
    .selectFrom('maintenance_requests')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('equipment_id', '=', id)
    .where('status', 'in', ['open', 'in_progress'])
    .executeTakeFirstOrThrow();
  return {
    ...toDto(row),
    serialNumber: extra.serial_number,
    assetTag: extra.asset_tag,
    purchasedOn: extra.purchased_on,
    archivedAt: extra.archived_at ? new Date(extra.archived_at).toISOString() : null,
    translations: Object.fromEntries(
      translations.map((t) => [
        t.locale,
        {
          name: t.name,
          description: t.description,
          usageInstructions: t.usage_instructions,
          safetyNotes: t.safety_notes,
        },
      ]),
    ),
    openRequests: Number(open.n),
  };
}

async function writeTranslations(
  tx: Tx,
  id: string,
  translations: UpdateEquipmentBody['translations'],
) {
  if (!translations) return;
  for (const [locale, tr] of Object.entries(translations)) {
    if (!tr) continue;
    const values = {
      name: tr.name,
      description: tr.description ?? null,
      usage_instructions: tr.usageInstructions ?? null,
      safety_notes: tr.safetyNotes ?? null,
    };
    await tx
      .insertInto('equipment_translations')
      .values({ equipment_id: id, locale, ...values })
      .onConflict((oc) => oc.columns(['equipment_id', 'locale']).doUpdateSet(values))
      .execute();
  }
}

async function categoryId(tx: Tx, key: string) {
  const c = await tx
    .selectFrom('equipment_categories')
    .select('id')
    .where('key', '=', key)
    .executeTakeFirst();
  if (!c)
    throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
      { path: 'categoryKey', message: 'validation.invalid_key' },
    ]);
  return c.id;
}

function columns(input: UpdateEquipmentBody) {
  return {
    ...(input.manufacturer !== undefined && { manufacturer: input.manufacturer }),
    ...(input.model !== undefined && { model: input.model }),
    ...(input.serialNumber !== undefined && { serial_number: input.serialNumber }),
    ...(input.assetTag !== undefined && { asset_tag: input.assetTag }),
    ...(input.purchasedOn !== undefined && { purchased_on: input.purchasedOn }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.videoUrl !== undefined && { video_url: input.videoUrl }),
  };
}

export function createEquipmentService(db: Kysely<DB>) {
  return {
    publicList: (locale: string, f: { q?: string; category?: string }) =>
      withAnonTx(db, async (tx) => (await query(tx, locale, f)).map(toDto)),

    publicGet: (locale: string, id: string) =>
      withAnonTx(db, async (tx) => {
        const [row] = await query(tx, locale, { id });
        if (!row) throw notFound('equipment');
        return toDto(row);
      }),

    categories: (locale: string) =>
      withAnonTx(db, async (tx) =>
        sql<{ key: string; name: string }>`
          select c.key, coalesce(t.name, ts.name, c.key) as name from public.equipment_categories c
          left join public.equipment_category_translations t on t.category_id = c.id and t.locale = ${locale}
          left join public.equipment_category_translations ts on ts.category_id = c.id and ts.locale = 'sr'
          order by c.sort_order`
          .execute(tx)
          .then((r) => r.rows),
      ),

    adminList: (locale: string, f: { q?: string; category?: string; status?: string }) =>
      withStaffTx(db, async (tx) => {
        const rows = await query(tx, locale, { ...f });
        return Promise.all(rows.map((r) => adminDto(tx, r.id, locale)));
      }),

    adminGet: (locale: string, id: string) => withStaffTx(db, (tx) => adminDto(tx, id, locale)),

    async create(actor: Actor, req: Request, input: CreateEquipmentBody, locale: string) {
      return withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('equipment')
          .values({
            category_id: await categoryId(tx, input.categoryKey),
            status: input.status,
            ...columns(input),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeTranslations(tx, row.id, input.translations);
        const dto = await adminDto(tx, row.id, locale);
        await writeAudit(tx, actor, req, {
          action: 'equipment.create',
          entityType: 'equipment',
          entityId: row.id,
          diff: { after: { name: dto.name } },
        });
        return dto;
      });
    },

    async update(
      actor: Actor,
      req: Request,
      id: string,
      input: UpdateEquipmentBody,
      locale: string,
    ) {
      return withStaffTx(db, async (tx) => {
        const before = await adminDto(tx, id, locale);
        const cols = columns(input);
        if (input.categoryKey)
          Object.assign(cols, { category_id: await categoryId(tx, input.categoryKey) });
        if (Object.keys(cols).length)
          await tx.updateTable('equipment').set(cols).where('id', '=', id).execute();
        await writeTranslations(tx, id, input.translations);
        const after = await adminDto(tx, id, locale);
        const diff = changedFields(
          { status: before.status, name: before.name, category: before.categoryKey },
          { status: after.status, name: after.name, category: after.categoryKey },
        );
        await writeAudit(tx, actor, req, {
          action: 'equipment.update',
          entityType: 'equipment',
          entityId: id,
          diff,
        });
        return after;
      });
    },

    /** Soft-delete: history (service log, requests) stays; it disappears from the map and catalogue. */
    async archive(actor: Actor, req: Request, id: string, locale: string) {
      return withStaffTx(db, async (tx) => {
        const res = await tx
          .updateTable('equipment')
          .set({ archived_at: new Date() })
          .where('id', '=', id)
          .where('archived_at', 'is', null)
          .executeTakeFirst();
        if (!res.numUpdatedRows) throw notFound('equipment');
        await writeAudit(tx, actor, req, {
          action: 'equipment.archive',
          entityType: 'equipment',
          entityId: id,
          diff: null,
        });
        return adminDto(tx, id, locale);
      });
    },
  };
}

// ── Maintenance ──────────────────────────────────────────────────────────────

async function maintenanceRows(
  tx: Tx,
  locale: string,
  f: { id?: string; status?: string; page?: number; pageSize?: number },
) {
  const rows = await sql<{
    id: string;
    equipment_id: string | null;
    equipment_name: string | null;
    equipment_status: EquipmentStatus | null;
    room_key: string | null;
    description: string;
    source: 'member' | 'staff';
    reporter: string | null;
    status: MaintenanceDto['status'];
    priority: MaintenanceDto['priority'];
    resolution_note: string | null;
    created_at: Date;
    resolved_at: Date | null;
    total: string;
  }>`
    select m.id, m.equipment_id, coalesce(t.name, ts.name) as equipment_name, e.status::text as equipment_status,
           m.room_key, m.description, m.source,
           nullif(trim(p.first_name || ' ' || p.last_name), '') as reporter,
           m.status::text as status, m.priority::text as priority, m.resolution_note, m.created_at, m.resolved_at,
           count(*) over () as total
    from public.maintenance_requests m
    left join public.equipment e on e.id = m.equipment_id
    left join public.equipment_translations t on t.equipment_id = e.id and t.locale = ${locale}
    left join public.equipment_translations ts on ts.equipment_id = e.id and ts.locale = 'sr'
    left join public.profiles p on p.id = m.reported_by
    where (${f.id ?? null}::uuid is null or m.id = ${f.id ?? null}::uuid)
      and (${f.status ?? null}::text is null or m.status::text = ${f.status ?? null})
    order by case m.status when 'open' then 0 when 'in_progress' then 1 else 2 end,
             case m.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
             m.created_at desc
    limit ${f.pageSize ?? 50} offset ${((f.page ?? 1) - 1) * (f.pageSize ?? 50)}
  `
    .execute(tx)
    .then((r) => r.rows);
  return {
    total: Number(rows[0]?.total ?? 0),
    items: rows.map((r): MaintenanceDto => ({
      id: r.id,
      equipmentId: r.equipment_id,
      equipmentName: r.equipment_name,
      equipmentStatus: r.equipment_status,
      roomKey: r.room_key,
      description: r.description,
      source: r.source,
      reportedByName: r.reporter,
      status: r.status,
      priority: r.priority,
      resolutionNote: r.resolution_note,
      createdAt: new Date(r.created_at).toISOString(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    })),
  };
}

export function createMaintenanceService(db: Kysely<DB>) {
  return {
    /** A member (or staff) reports a problem. The machine's status is NOT changed automatically. */
    async report(
      actor: Actor,
      req: Request,
      input: { equipmentId?: string; roomKey?: string; description: string },
    ) {
      return withStaffTx(db, async (tx) => {
        if (input.equipmentId) {
          const e = await tx
            .selectFrom('equipment')
            .select('id')
            .where('id', '=', input.equipmentId)
            .where('archived_at', 'is', null)
            .executeTakeFirst();
          if (!e) throw notFound('equipment');
        }
        const row = await tx
          .insertInto('maintenance_requests')
          .values({
            equipment_id: input.equipmentId ?? null,
            room_key: input.roomKey ?? null,
            description: input.description,
            source: actor.permissions.size > 0 ? 'staff' : 'member',
            reported_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'maintenance.report',
          entityType: 'maintenance_request',
          entityId: row.id,
          diff: null,
        });
        return { id: row.id };
      });
    },

    list: (locale: string, f: { status?: string; page: number; pageSize: number }) =>
      withStaffTx(db, (tx) => maintenanceRows(tx, locale, f)),

    async update(
      actor: Actor,
      req: Request,
      id: string,
      input: {
        status?: MaintenanceDto['status'];
        priority?: MaintenanceDto['priority'];
        resolutionNote?: string | null;
        equipmentStatus?: EquipmentStatus;
      },
      locale: string,
    ) {
      return withStaffTx(db, async (tx) => {
        const current = await tx
          .selectFrom('maintenance_requests')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!current) throw notFound('maintenance');
        const closing = input.status === 'resolved' || input.status === 'rejected';
        await tx
          .updateTable('maintenance_requests')
          .set({
            ...(input.status && { status: input.status }),
            ...(input.priority && { priority: input.priority }),
            ...(input.resolutionNote !== undefined && { resolution_note: input.resolutionNote }),
            ...(input.status && { resolved_at: closing ? new Date() : null }),
            ...(input.status && !current.assigned_to && { assigned_to: actor.userId }),
          })
          .where('id', '=', id)
          .execute();
        if (input.equipmentStatus) {
          if (!current.equipment_id)
            throw new AppError('BUSINESS_RULE', 'errors.maintenance.no_equipment');
          await tx
            .updateTable('equipment')
            .set({ status: input.equipmentStatus })
            .where('id', '=', current.equipment_id)
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'maintenance.update',
          entityType: 'maintenance_request',
          entityId: id,
          diff: {
            before: { status: current.status, priority: current.priority },
            after: { ...input },
          },
        });
        const { items } = await maintenanceRows(tx, locale, { id });
        return items[0]!;
      });
    },
  };
}
