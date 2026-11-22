import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  EarningsDto,
  SellServiceBody,
  ServiceBody,
  ServiceDto,
  ServiceSaleDto,
  TrainerRateDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

type Tr = Record<string, { name?: string; description?: string | null }>;
const tr = (t: unknown, locale: string) => {
  const x = (t ?? {}) as Tr;
  return x[locale]?.name ? x[locale]! : locale === 'ar' && x.en?.name ? x.en : (x.sr ?? {});
};
const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());

async function list(tx: Tx, locale: string, staff: boolean): Promise<ServiceDto[]> {
  let q = tx.selectFrom('services').selectAll().orderBy('sort_order').orderBy('created_at');
  if (!staff) q = q.where('is_active', '=', true).where('is_sellable', '=', true);
  return (await q.execute()).map((s) => ({
    id: s.id,
    key: s.key,
    name: tr(s.translations, locale).name ?? '-',
    description: tr(s.translations, locale).description ?? null,
    priceAmount: s.price_amount,
    currency: s.currency,
    durationMin: s.duration_min,
    needsProvider: s.needs_provider,
    defaultShareKind: s.default_share_kind as ServiceDto['defaultShareKind'],
    defaultShareValue: s.default_share_value,
    isSellable: s.is_sellable,
    isActive: s.is_active,
    sortOrder: s.sort_order,
    ...(staff && { translations: s.translations as ServiceDto['translations'] }),
  }));
}

async function sales(
  tx: Tx,
  where: { from?: string; to?: string; ids?: string[]; memberId?: string },
) {
  let q = tx
    .selectFrom('service_sales as s')
    .leftJoin('members as m', 'm.id', 's.member_id')
    .leftJoin('trainers as t', 't.id', 's.trainer_id')
    .leftJoin('profiles as p', 'p.id', 's.sold_by')
    .selectAll('s')
    .select([
      sql<string | null>`m.first_name || ' ' || m.last_name`.as('member_name'),
      sql<string | null>`t.first_name || ' ' || t.last_name`.as('trainer_name'),
      sql<string | null>`nullif(trim(p.first_name || ' ' || p.last_name), '')`.as('sold_by_name'),
    ])
    .orderBy('s.sold_at', 'desc');
  if (where.ids) q = q.where('s.id', 'in', where.ids);
  if (where.memberId) q = q.where('s.member_id', '=', where.memberId).limit(50);
  if (where.from && where.to)
    q = q.where(
      sql<boolean>`(s.sold_at at time zone 'Europe/Belgrade')::date between ${where.from}::date and ${where.to}::date`,
    );
  return (await q.limit(500).execute()).map((s): ServiceSaleDto => ({
    id: s.id,
    serviceId: s.service_id,
    name: s.name,
    qty: s.qty,
    unitPrice: s.unit_price,
    totalAmount: s.total_amount,
    currency: s.currency,
    memberId: s.member_id,
    memberName: s.member_name,
    trainerId: s.trainer_id,
    trainerName: s.trainer_name,
    trainerShareAmount: s.trainer_share_amount,
    paymentMethod: s.payment_method as ServiceSaleDto['paymentMethod'],
    note: s.note,
    soldAt: iso(s.sold_at)!,
    soldByName: s.sold_by_name,
    voidedAt: iso(s.voided_at),
    voidReason: s.void_reason,
  }));
}

const values = (b: ServiceBody) => ({
  translations: JSON.stringify(b.translations),
  price_amount: b.priceAmount,
  duration_min: b.durationMin ?? null,
  needs_provider: b.needsProvider,
  default_share_kind: b.defaultShareKind,
  default_share_value: b.defaultShareValue,
  is_active: b.isActive,
  sort_order: b.sortOrder,
});

export function createServicesService(db: Kysely<DB>) {
  return {
    publicList: (locale: string) => withStaffTx(db, (tx) => list(tx, locale, false)),
    staffList: (locale: string) => withStaffTx(db, (tx) => list(tx, locale, true)),
    save: (actor: Actor, req: Request, locale: string, b: ServiceBody, id?: string) =>
      withStaffTx(db, async (tx) => {
        if (id) {
          const before = await tx
            .selectFrom('services')
            .select(['price_amount', 'key'])
            .where('id', '=', id)
            .executeTakeFirst();
          if (!before) throw notFound('service');
          await tx.updateTable('services').set(values(b)).where('id', '=', id).execute();
          await writeAudit(tx, actor, req, {
            action: 'service.update',
            entityType: 'service',
            entityId: id,
            diff: {
              before: { priceAmount: before.price_amount },
              after: {
                priceAmount: b.priceAmount,
                share: `${b.defaultShareValue} ${b.defaultShareKind}`,
              },
            },
          });
        } else {
          const r = await tx
            .insertInto('services')
            .values(values(b))
            .returning('id')
            .executeTakeFirstOrThrow();
          await writeAudit(tx, actor, req, {
            action: 'service.create',
            entityType: 'service',
            entityId: r.id,
            diff: { after: { priceAmount: b.priceAmount } },
          });
        }
        return list(tx, locale, true);
      }),

    rates: () =>
      withStaffTx(db, async (tx): Promise<TrainerRateDto[]> =>
        (await tx.selectFrom('trainer_service_rates').selectAll().execute()).map((r) => ({
          trainerId: r.trainer_id,
          serviceId: r.service_id,
          shareKind: r.share_kind as TrainerRateDto['shareKind'],
          shareValue: r.share_value,
        })),
      ),
    setRate: (
      actor: Actor,
      req: Request,
      b: {
        trainerId: string;
        serviceId: string;
        shareKind: 'percent' | 'fixed' | null;
        shareValue: number;
      },
    ) =>
      withStaffTx(db, async (tx) => {
        if (b.shareKind === null) {
          await tx
            .deleteFrom('trainer_service_rates')
            .where('trainer_id', '=', b.trainerId)
            .where('service_id', '=', b.serviceId)
            .execute();
        } else {
          const v = { share_kind: b.shareKind, share_value: b.shareValue, updated_at: new Date() };
          await tx
            .insertInto('trainer_service_rates')
            .values({ trainer_id: b.trainerId, service_id: b.serviceId, ...v })
            .onConflict((oc) => oc.columns(['trainer_id', 'service_id']).doUpdateSet(v))
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'trainer_rate.set',
          entityType: 'trainer',
          entityId: b.trainerId,
          diff: { after: { serviceId: b.serviceId, kind: b.shareKind, value: b.shareValue } },
        });
        return { ok: true as const };
      }),

    sell: (actor: Actor, req: Request, b: SellServiceBody) =>
      withStaffTx(db, async (tx) => {
        const s = await tx
          .selectFrom('services')
          .selectAll()
          .where('id', '=', b.serviceId)
          .executeTakeFirst();
        if (!s || !s.is_active || !s.is_sellable)
          throw new AppError('BUSINESS_RULE', 'errors.service.unavailable');
        if (s.needs_provider && !b.trainerId)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'trainerId', message: 'validation.required' },
          ]);
        if (b.memberId) {
          const m = await tx
            .selectFrom('members')
            .select('id')
            .where('id', '=', b.memberId)
            .executeTakeFirst();
          if (!m) throw notFound('member');
        }
        if (b.trainerId) {
          const t = await tx
            .selectFrom('trainers')
            .select('id')
            .where('id', '=', b.trainerId)
            .where('archived_at', 'is', null)
            .executeTakeFirst();
          if (!t) throw notFound('trainer');
        }
        const total = s.price_amount * b.qty;
        const share = b.trainerId
          ? await sql<{
              v: number | null;
            }>`select public.trainer_share(${b.trainerId}, ${s.id}, ${total}) as v`
              .execute(tx)
              .then((r) => r.rows[0]?.v ?? 0)
          : 0;
        const row = await tx
          .insertInto('service_sales')
          .values({
            service_id: s.id,
            member_id: b.memberId ?? null,
            trainer_id: b.trainerId ?? null,
            name: tr(s.translations, 'sr').name ?? '-',
            qty: b.qty,
            unit_price: s.price_amount,
            total_amount: total,
            currency: s.currency,
            trainer_share_amount: Math.min(share ?? 0, total),
            payment_method: b.paymentMethod,
            note: b.note ?? null,
            sold_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'service.sell',
          entityType: 'service_sale',
          entityId: row.id,
          diff: { after: { serviceId: s.id, total, method: b.paymentMethod } },
        });
        return (await sales(tx, { ids: [row.id] }))[0]!;
      }),
    sales: (from: string, to: string) => withStaffTx(db, (tx) => sales(tx, { from, to })),
    memberSales: (memberId: string) => withStaffTx(db, (tx) => sales(tx, { memberId })),
    void: (actor: Actor, req: Request, id: string, reason: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('service_sales')
          .set({ voided_at: new Date(), voided_by: actor.userId, void_reason: reason })
          .where('id', '=', id)
          .where('voided_at', 'is', null)
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows))
          throw new AppError('CONFLICT', 'errors.service.already_voided');
        await writeAudit(tx, actor, req, {
          action: 'service_sale.void',
          entityType: 'service_sale',
          entityId: id,
          diff: { after: { reason } },
        });
        return (await sales(tx, { ids: [id] }))[0]!;
      }),

    /** Month (club time) per trainer: PT sessions held and services performed, with frozen shares. */
    earnings: (month: string, locale: string, onlyTrainerId?: string) =>
      withStaffTx(db, async (tx): Promise<EarningsDto> => {
        const from = `${month}-01`;
        const pt = await sql<{ trainer_id: string; n: number; share: number }>`
          select p.trainer_id, count(*)::int as n, coalesce(sum(p.trainer_share_amount), 0)::int as share
          from public.pt_sessions p
          where p.trainer_id is not null and p.voided_at is null
            and p.held_on >= ${from}::date and p.held_on < (${from}::date + interval '1 month')
          group by 1`
          .execute(tx)
          .then((r) => r.rows);
        const sv = await sql<{
          trainer_id: string;
          service_id: string;
          translations: unknown;
          n: number;
          revenue: number;
          share: number;
        }>`
          select s.trainer_id, s.service_id, sv.translations, sum(s.qty)::int as n,
                 sum(s.total_amount)::int as revenue, sum(s.trainer_share_amount)::int as share
          from public.service_sales s join public.services sv on sv.id = s.service_id
          where s.trainer_id is not null and s.voided_at is null
            and (s.sold_at at time zone 'Europe/Belgrade')::date >= ${from}::date
            and (s.sold_at at time zone 'Europe/Belgrade')::date < (${from}::date + interval '1 month')
          group by 1, 2, 3`
          .execute(tx)
          .then((r) => r.rows);
        const ids = [
          ...new Set([...pt.map((p) => p.trainer_id), ...sv.map((s) => s.trainer_id)]),
        ].filter((id) => !onlyTrainerId || id === onlyTrainerId);
        if (onlyTrainerId && !ids.includes(onlyTrainerId)) ids.push(onlyTrainerId);
        const names = ids.length
          ? await tx
              .selectFrom('trainers')
              .select(['id', 'first_name', 'last_name'])
              .where('id', 'in', ids)
              .execute()
          : [];
        const trainers = names
          .map((t) => {
            const p = pt.find((x) => x.trainer_id === t.id);
            const services = sv
              .filter((x) => x.trainer_id === t.id)
              .map((x) => ({
                serviceId: x.service_id,
                name: tr(x.translations, locale).name ?? '-',
                count: x.n,
                revenue: x.revenue,
                share: x.share,
              }));
            const servicesShare = services.reduce((a, x) => a + x.share, 0);
            return {
              trainerId: t.id,
              trainerName: `${t.first_name} ${t.last_name}`,
              ptSessions: p?.n ?? 0,
              ptShare: p?.share ?? 0,
              services,
              servicesShare,
              total: (p?.share ?? 0) + servicesShare,
            };
          })
          .sort((a, b) => b.total - a.total);
        return {
          month,
          currency: 'RSD',
          trainers,
          total: trainers.reduce((a, x) => a + x.total, 0),
        };
      }),
    trainerIdOf: (userId: string) =>
      withStaffTx(
        db,
        async (tx) =>
          (
            await tx
              .selectFrom('trainers')
              .select('id')
              .where('user_id', '=', userId)
              .executeTakeFirst()
          )?.id ?? null,
      ),
  };
}
