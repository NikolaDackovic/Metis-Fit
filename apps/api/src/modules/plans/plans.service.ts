import type { Request } from 'express';
import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { CreatePlanBody, PlanDto, UpdatePlanBody } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { notFound } from '../../shared/errors';

async function loadPlans(tx: Tx, id?: string): Promise<PlanDto[]> {
  let q = tx.selectFrom('membership_plans').selectAll().orderBy('sort_order').orderBy('created_at');
  if (id) q = q.where('id', '=', id);
  const plans = await q.execute();
  if (plans.length === 0) return [];
  const ids = plans.map((p) => p.id);
  const [translations, zones] = await Promise.all([
    tx.selectFrom('membership_plan_translations').selectAll().where('plan_id', 'in', ids).execute(),
    tx
      .selectFrom('membership_plan_zones as pz')
      .innerJoin('zones as z', 'z.id', 'pz.zone_id')
      .select(['pz.plan_id', 'z.key'])
      .where('pz.plan_id', 'in', ids)
      .execute(),
  ]);
  return plans.map((p) => ({
    id: p.id,
    kind: p.kind,
    priceAmount: p.price_amount,
    currency: p.currency,
    durationDays: p.duration_days,
    visitLimit: p.visit_limit,
    maxPauses: p.max_pauses,
    maxPauseDays: p.max_pause_days,
    isAvailable: p.is_available,
    sortOrder: p.sort_order,
    zones: zones.filter((z) => z.plan_id === p.id).map((z) => z.key),
    translations: Object.fromEntries(
      translations
        .filter((t) => t.plan_id === p.id)
        .map((t) => [t.locale, { name: t.name, description: t.description, terms: t.terms }]),
    ),
  }));
}

async function writeTranslationsAndZones(
  tx: Tx,
  planId: string,
  input: Pick<UpdatePlanBody, 'translations' | 'zones'>,
) {
  if (input.translations) {
    for (const [locale, t] of Object.entries(input.translations)) {
      if (!t) continue;
      await tx
        .insertInto('membership_plan_translations')
        .values({
          plan_id: planId,
          locale,
          name: t.name,
          description: t.description ?? null,
          terms: t.terms ?? null,
        })
        .onConflict((oc) =>
          oc.columns(['plan_id', 'locale']).doUpdateSet({
            name: t.name,
            description: t.description ?? null,
            terms: t.terms ?? null,
          }),
        )
        .execute();
    }
  }
  if (input.zones) {
    await tx.deleteFrom('membership_plan_zones').where('plan_id', '=', planId).execute();
    if (input.zones.length) {
      const zoneRows = await tx
        .selectFrom('zones')
        .select('id')
        .where('key', 'in', input.zones)
        .execute();
      await tx
        .insertInto('membership_plan_zones')
        .values(zoneRows.map((z) => ({ plan_id: planId, zone_id: z.id })))
        .execute();
    }
  }
}

function planColumns(input: UpdatePlanBody) {
  return {
    ...(input.kind !== undefined && { kind: input.kind }),
    ...(input.priceAmount !== undefined && { price_amount: input.priceAmount }),
    ...(input.durationDays !== undefined && { duration_days: input.durationDays }),
    ...(input.visitLimit !== undefined && { visit_limit: input.visitLimit }),
    ...(input.maxPauses !== undefined && { max_pauses: input.maxPauses }),
    ...(input.maxPauseDays !== undefined && { max_pause_days: input.maxPauseDays }),
    ...(input.isAvailable !== undefined && { is_available: input.isAvailable }),
    ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
  };
}

export function createPlansService(db: Kysely<DB>) {
  return {
    list: () => withStaffTx(db, (tx) => loadPlans(tx)),

    async create(actor: Actor, req: Request, input: CreatePlanBody): Promise<PlanDto> {
      return withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('membership_plans')
          .values({
            ...(planColumns(input) as { kind: CreatePlanBody['kind']; price_amount: number }),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeTranslationsAndZones(tx, row.id, input);
        const [dto] = await loadPlans(tx, row.id);
        await writeAudit(tx, actor, req, {
          action: 'plan.create',
          entityType: 'membership_plan',
          entityId: row.id,
          diff: { after: dto },
        });
        return dto!;
      });
    },

    /** Price changes apply to future sales only: memberships keep their own price snapshot. */
    async update(actor: Actor, req: Request, id: string, input: UpdatePlanBody): Promise<PlanDto> {
      return withStaffTx(db, async (tx) => {
        const [before] = await loadPlans(tx, id);
        if (!before) throw notFound('plan');
        const columns = planColumns(input);
        if (Object.keys(columns).length) {
          await tx.updateTable('membership_plans').set(columns).where('id', '=', id).execute();
        }
        await writeTranslationsAndZones(tx, id, input);
        const [after] = await loadPlans(tx, id);
        // A plan must keep at least one limit (duration or visits) - enforced by DB constraint too.
        await writeAudit(tx, actor, req, {
          action: 'plan.update',
          entityType: 'membership_plan',
          entityId: id,
          diff: changedFields(before, after!),
        });
        return after!;
      });
    },
  };
}
