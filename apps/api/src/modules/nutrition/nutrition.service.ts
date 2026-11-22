import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import {
  aiMealPlan,
  nutritionTargetsDto,
  nutritionWizardBody,
  type NutritionPlanDto,
  type NutritionWizardBody,
} from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { AppError } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import type { MealPlanner } from './meal-planner';
import { computeTargets } from './targets';

interface Row {
  id: string;
  created_at: Date;
  status: 'ready' | 'targets_only';
  input: unknown;
  targets: unknown;
  meals: unknown;
}

const toDto = (r: Row): NutritionPlanDto => ({
  id: r.id,
  createdAt: new Date(r.created_at).toISOString(),
  status: r.status,
  input: nutritionWizardBody.parse(r.input),
  targets: nutritionTargetsDto.parse(r.targets),
  meals: r.meals ? aiMealPlan.parse(r.meals) : null,
});

export function createNutritionService(db: Kysely<DB>, planner: MealPlanner) {
  return {
    /**
     * Wizard result: safe targets always; an AI meal plan when available. The AI call happens
     * outside any transaction (it can take a minute).
     */
    async create(
      actor: Actor,
      input: NutritionWizardBody,
      locale: string,
    ): Promise<NutritionPlanDto> {
      if (input.healthConditions)
        throw new AppError('BUSINESS_RULE', 'errors.nutrition.see_professional');
      const memberId = await withStaffTx(db, async (tx) => {
        const id = await memberIdFor(tx, actor);
        const { n, limit } = await sql<{ n: number; limit: number }>`
          select count(*)::int as n, public.setting_int('nutrition.daily_limit', 3) as limit
          from public.nutrition_plans
          where member_id = ${id} and created_at > now() - interval '1 day'`
          .execute(tx)
          .then((r) => r.rows[0]!);
        if (n >= limit) throw new AppError('RATE_LIMITED', 'errors.nutrition.daily_limit');
        return id;
      });
      const targets = computeTargets(input);
      const ai = await planner({ input, targets, locale });
      return withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('nutrition_plans')
          .values({
            member_id: memberId,
            input: JSON.stringify(input),
            targets: JSON.stringify(targets),
            meals: ai ? JSON.stringify(ai.plan) : null,
            status: ai ? 'ready' : 'targets_only',
            model: ai?.model ?? null,
          })
          .returning(['id', 'created_at', 'status', 'input', 'targets', 'meals'])
          .executeTakeFirstOrThrow();
        return toDto(row as Row);
      });
    },

    latest: (actor: Actor): Promise<NutritionPlanDto | null> =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const row = await tx
          .selectFrom('nutrition_plans')
          .select(['id', 'created_at', 'status', 'input', 'targets', 'meals'])
          .where('member_id', '=', memberId)
          .orderBy('created_at', 'desc')
          .executeTakeFirst();
        return row ? toDto(row as Row) : null;
      }),
  };
}
