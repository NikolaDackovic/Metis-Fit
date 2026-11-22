import type { DietRestriction, MealPlanContent } from '@grit/validation';

/**
 * The club's example meal plans are written once per goal. Before showing one, meal options that
 * clash with what the member does not eat are removed, by ingredient words (sr / en / ru).
 * A meal whose every option clashes stays, with a tip to swap the ingredient (never left empty).
 */
type Food = 'fish' | 'meat' | 'pork' | 'dairy' | 'eggs' | 'gluten' | 'nuts';

const WORDS: Record<Food, string[]> = {
  fish: [
    'rib',
    'tuna',
    'tunjevin',
    'losos',
    'sardin',
    'skuš',
    'oslić',
    'pastrmk',
    'škamp',
    'lignj',
    'fish',
    'salmon',
    'sardine',
    'shrimp',
    'cod',
    'рыб',
    'тунец',
    'лосос',
    'сардин',
    'кревет',
    'треск',
  ],
  meat: [
    'piletin',
    'pileć',
    'ćuret',
    'ćureć',
    'junet',
    'junać',
    'govedin',
    'goveđ',
    'svinj',
    'šunk',
    'slanin',
    'kobasic',
    'pršut',
    'meso',
    'mesn',
    'chicken',
    'turkey',
    'beef',
    'pork',
    'ham',
    'bacon',
    'sausage',
    'meat',
    'куриц',
    'курин',
    'индейк',
    'говядин',
    'свинин',
    'ветчин',
    'бекон',
    'колбас',
    'мяс',
  ],
  pork: ['svinj', 'šunk', 'slanin', 'pršut', 'pork', 'ham', 'bacon', 'свинин', 'ветчин', 'бекон'],
  dairy: [
    'mlek',
    'mleč',
    'jogurt',
    'sir(?!ć|up)',
    'kajmak',
    'pavlak',
    'kefir',
    'surutk',
    'milk',
    'yogurt',
    'yoghurt',
    'cheese',
    'kefir',
    'whey',
    'молок',
    'молоч',
    'йогурт',
    'сыр',
    'творог',
    'кефир',
  ],
  eggs: ['jaj', 'egg', 'omlet', 'omelet', 'яйц', 'яич', 'омлет'],
  gluten: [
    'hleb',
    'testenin',
    'pšenič',
    'tortilj',
    'kuskus',
    'ječam',
    'bread',
    'pasta',
    'wheat',
    'tortilla',
    'couscous',
    'barley',
    'хлеб',
    'макарон',
    'пшени',
    'лаваш',
    'кускус',
  ],
  nuts: [
    'orah',
    'orasi',
    'badem',
    'lešnik',
    'kikiriki',
    'indijsk',
    'pistać',
    'nut',
    'almond',
    'walnut',
    'peanut',
    'cashew',
    'pistachio',
    'орех',
    'миндал',
    'арахис',
    'кешью',
    'фисташ',
  ],
};

const AVOID: Record<DietRestriction, Food[]> = {
  vegetarian: ['meat', 'fish'],
  vegan: ['meat', 'fish', 'dairy', 'eggs'],
  pescatarian: ['meat'],
  no_fish: ['fish'],
  no_eggs: ['eggs'],
  no_pork: ['pork'],
  halal: ['pork'],
  lactose_free: ['dairy'],
  gluten_free: ['gluten'],
  nut_allergy: ['nuts'],
};

const TIP: Record<string, string> = {
  sr: 'Za obroke gde nema druge opcije zameni namirnicu koju ne jedeš sličnom (npr. tofu, mahunarke, biljno mleko) ili pitaj trenera.',
  en: 'For meals with no other option, swap the ingredient you do not eat for a similar one (e.g. tofu, legumes, plant milk) or ask your trainer.',
  ru: 'Если другого варианта нет, замените продукт, который вы не едите, похожим (например, тофу, бобовые, растительное молоко) или спросите тренера.',
};

/** Word starts only ("sir" matches "sir", "sirni", not "kisela"); letters of any script. */
const hit = (text: string, stem: string) => new RegExp(`(?<![\\p{L}])${stem}`, 'iu').test(text);

export function filterMealPlan(
  plan: MealPlanContent,
  restrictions: readonly DietRestriction[],
  locale: string,
): MealPlanContent {
  const avoid = new Set(restrictions.flatMap((r) => AVOID[r] ?? []));
  if (!avoid.size) return plan;
  const stems = [...avoid].flatMap((f) => WORDS[f]);
  const clashes = (o: MealPlanContent['meals'][number]['options'][number]) =>
    [o.title, ...o.ingredients].some((text) => stems.some((s) => hit(text, s)));
  let swapped = false;
  const meals = plan.meals.map((m) => {
    const ok = m.options.filter((o) => !clashes(o));
    if (ok.length) return { ...m, options: ok };
    swapped = true;
    return m;
  });
  const tips = swapped ? [...plan.tips, TIP[locale] ?? TIP.en!].slice(-6) : plan.tips;
  return { ...plan, meals, tips };
}
