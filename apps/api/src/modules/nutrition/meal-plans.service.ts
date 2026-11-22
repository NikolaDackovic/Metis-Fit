import type { Request } from 'express';
import type { Kysely } from 'kysely';
import type { DB } from '@grit/database';
import {
  mealPlanContent,
  type MealPlanContent,
  type MemberNutritionPlanDto,
  type MyNutritionDto,
  type NutritionTemplateDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { createNutritionService } from './nutrition.service';
import type { MealPlanner } from './meal-planner';
import { assertCanPlan } from './workout-plans.service';
import { filterMealPlan } from './diet-filter';

type Goal = NutritionTemplateDto['goal'];

async function template(tx: Tx, goal: Goal, locale: string): Promise<MealPlanContent | null> {
  const rows = await tx
    .selectFrom('nutrition_template_translations')
    .select(['locale', 'content'])
    .where('goal', '=', goal)
    .where('locale', 'in', [locale, 'sr'])
    .execute();
  const row = rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'sr');
  const parsed = row ? mealPlanContent.safeParse(row.content) : null;
  return parsed?.success ? parsed.data : null;
}

async function memberPlan(tx: Tx, memberId: string): Promise<MemberNutritionPlanDto | null> {
  const r = await tx
    .selectFrom('member_nutrition_plans as p')
    .leftJoin('trainers as t', 't.id', 'p.trainer_id')
    .select(['p.content', 'p.updated_at', 't.first_name', 't.last_name'])
    .where('p.member_id', '=', memberId)
    .executeTakeFirst();
  if (!r) return null;
  return {
    content: mealPlanContent.parse(r.content),
    trainerName: r.first_name ? `${r.first_name} ${r.last_name}` : null,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export function createMealPlanService(db: Kysely<DB>, planner: MealPlanner) {
  return {
    /** What the member sees: the trainer's plan, else an AI plan (if enabled), else the club example. */
    async mine(actor: Actor, locale: string): Promise<MyNutritionDto> {
      const latest = await createNutritionService(db, planner).latest(actor);
      return withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const own = await memberPlan(tx, memberId);
        if (own)
          return { latest, meals: own.content, source: 'trainer', trainerName: own.trainerName };
        if (latest?.meals) return { latest, meals: latest.meals, source: 'ai', trainerName: null };
        const raw = await template(tx, latest?.input.goal ?? 'maintain', locale);
        // The club example without options the member does not eat (wizard restrictions).
        const example = raw ? filterMealPlan(raw, latest?.input.restrictions ?? [], locale) : null;
        return {
          latest,
          meals: example,
          source: example ? 'template' : null,
          trainerName: null,
        };
      });
    },

    // ── Club examples ─────────────────────────────────────────────────────────
    templates: (): Promise<NutritionTemplateDto[]> =>
      withStaffTx(db, async (tx) => {
        const heads = await tx.selectFrom('nutrition_templates').selectAll().execute();
        const tr = await tx.selectFrom('nutrition_template_translations').selectAll().execute();
        const order: Goal[] = ['lose', 'maintain', 'gain'];
        return heads
          .sort((a, b) => order.indexOf(a.goal as Goal) - order.indexOf(b.goal as Goal))
          .map((h) => ({
            goal: h.goal as Goal,
            updatedAt: new Date(h.updated_at).toISOString(),
            translations: Object.fromEntries(
              tr
                .filter((x) => x.goal === h.goal)
                .map((x) => [x.locale, mealPlanContent.parse(x.content)]),
            ),
          }));
      }),

    updateTemplate: (
      actor: Actor,
      req: Request,
      goal: Goal,
      translations: Partial<Record<string, MealPlanContent>>,
    ) =>
      withStaffTx(db, async (tx) => {
        const h = await tx
          .updateTable('nutrition_templates')
          .set({ updated_by: actor.userId, updated_at: new Date() })
          .where('goal', '=', goal)
          .returning('goal')
          .executeTakeFirst();
        if (!h) throw notFound('nutrition_template');
        for (const [locale, content] of Object.entries(translations)) {
          if (!content) continue;
          await tx
            .insertInto('nutrition_template_translations')
            .values({ goal, locale, content: JSON.stringify(content) })
            .onConflict((oc) =>
              oc
                .columns(['club_id', 'goal', 'locale'])
                .doUpdateSet({ content: JSON.stringify(content) }),
            )
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'nutrition_template.update',
          entityType: 'nutrition_template',
          entityId: null,
          diff: { after: { goal, locales: Object.keys(translations) } },
        });
        return { ok: true };
      }),

    // ── The trainer's individual plan for a member ────────────────────────────
    memberPlan: (actor: Actor, memberId: string) =>
      withStaffTx(db, async (tx) => {
        await assertCanPlan(tx, actor, memberId);
        return memberPlan(tx, memberId);
      }),

    setMemberPlan: (actor: Actor, req: Request, memberId: string, content: MealPlanContent) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!m) throw notFound('member');
        const trainerId = await assertCanPlan(tx, actor, memberId);
        const values = {
          content: JSON.stringify(content),
          trainer_id: trainerId,
          updated_by: actor.userId,
          updated_at: new Date(),
        };
        await tx
          .insertInto('member_nutrition_plans')
          .values({ member_id: memberId, ...values })
          .onConflict((oc) => oc.column('member_id').doUpdateSet(values))
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'member_nutrition_plan.set',
          entityType: 'member',
          entityId: memberId,
        });
        return (await memberPlan(tx, memberId))!;
      }),

    removeMemberPlan: (actor: Actor, req: Request, memberId: string) =>
      withStaffTx(db, async (tx) => {
        await assertCanPlan(tx, actor, memberId);
        await tx.deleteFrom('member_nutrition_plans').where('member_id', '=', memberId).execute();
        await writeAudit(tx, actor, req, {
          action: 'member_nutrition_plan.remove',
          entityType: 'member',
          entityId: memberId,
        });
        return { ok: true };
      }),
  };
}
