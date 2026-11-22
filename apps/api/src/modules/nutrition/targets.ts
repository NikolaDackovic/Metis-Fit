import type { NutritionTargetsDto, NutritionWizardBody } from '@grit/validation';

const ACTIVITY: Record<NutritionWizardBody['activity'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Never prescribe less than this without professional supervision. */
const KCAL_FLOOR = { female: 1400, male: 1600 } as const;
const KCAL_PER_KG = 7700;
const round = (n: number, step = 1) => Math.round(n / step) * step;

/**
 * Daily energy and macro targets. Deterministic and conservative: the AI only suggests meals
 * that fit these numbers; it never decides how much someone should eat.
 *
 * - BMR: Mifflin-St Jeor. TDEE = BMR × activity factor.
 * - Lose: −20 % of TDEE (at most −750 kcal), never below the floor or BMR.
 * - Gain: +10 % (at most +400 kcal). Underweight (BMI < 18.5) is never put on a deficit.
 * - Protein per kg of a reference weight (BMI 25 weight when BMI > 30), fat 0.8 g/kg, rest carbs.
 */
export function computeTargets(b: NutritionWizardBody): NutritionTargetsDto {
  const h = b.heightCm / 100;
  const bmi = b.weightKg / (h * h);
  const bmr = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + (b.sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[b.activity];

  let goal = b.goal;
  let adjustedBy: string | null = null;
  if (goal === 'lose' && bmi < 18.5) {
    goal = 'maintain';
    adjustedBy = 'nutrition.adjusted_underweight';
  }

  let kcal = tdee;
  if (goal === 'lose') kcal = tdee - Math.min(tdee * 0.2, 750);
  if (goal === 'gain') kcal = tdee + Math.min(tdee * 0.1, 400);
  const floor = Math.max(KCAL_FLOOR[b.sex], goal === 'lose' ? bmr : 0);
  if (kcal < floor) {
    kcal = floor;
    adjustedBy ??= 'nutrition.adjusted_floor';
  }

  const refWeight = bmi > 30 ? 25 * h * h : b.weightKg;
  const proteinPerKg = goal === 'lose' ? 2.0 : goal === 'gain' ? 1.8 : 1.6;
  const proteinG = round(refWeight * proteinPerKg, 5);
  const fatG = round(Math.max(refWeight * 0.8, (kcal * 0.2) / 9), 5);
  const carbsG = round(Math.max(50, (kcal - proteinG * 4 - fatG * 9) / 4), 5);
  const kcalRounded = round(kcal, 10);

  return {
    bmr: round(bmr, 10),
    tdee: round(tdee, 10),
    kcal: kcalRounded,
    proteinG,
    fatG,
    carbsG,
    weeklyChangeKg: Math.round((((kcalRounded - tdee) * 7) / KCAL_PER_KG) * 100) / 100,
    adjustedBy,
  };
}
