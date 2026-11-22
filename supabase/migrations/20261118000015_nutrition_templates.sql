-- GRIT DIGITAL CLUB - 015 example nutrition plans (templates per goal, editable in the admin) and
-- individual nutrition plans written by the member's trainer. Decision 2026-11-18: no AI answers by
-- default; members see the trainer's plan, otherwise the club's example for their goal. AI stays an
-- optional extra (ANTHROPIC_API_KEY).

create table public.nutrition_templates (
  goal text primary key check (goal in ('lose', 'maintain', 'gain')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.nutrition_template_translations (
  goal text not null references public.nutrition_templates (goal) on delete cascade,
  locale text not null check (locale in ('sr', 'en', 'ru', 'ar')),
  content jsonb not null, -- { summary, meals: [{ name, time, options: [{ title, ingredients[], kcal, proteinG }] }], tips[] }
  primary key (goal, locale)
);

create table public.member_nutrition_plans (
  member_id uuid primary key references public.members (id) on delete cascade,
  trainer_id uuid references public.trainers (id) on delete set null,
  content jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.permissions (key, description) values
  ('nutrition.manage', 'Edit the example nutrition plans');
insert into public.role_permissions (role_id, permission_key)
select r.id, 'nutrition.manage' from public.roles r where r.key in ('owner', 'manager', 'trainer');

alter table public.nutrition_templates enable row level security;
alter table public.nutrition_template_translations enable row level security;
alter table public.member_nutrition_plans enable row level security;
revoke all on public.nutrition_templates, public.nutrition_template_translations,
  public.member_nutrition_plans from anon, authenticated;
-- Everything is read through the API (it picks trainer plan / template and the locale).

-- Hyphens instead of dashes in exercise texts (house style).
update public.exercise_translations
   set instructions = replace(replace(instructions, ' — ', ' - '), '–', '-')
 where instructions like '%—%' or instructions like '%–%';

-- ── Example plans (general guidance, not medical advice; the club edits them) ──
insert into public.nutrition_templates (goal) values ('lose'), ('maintain'), ('gain');

insert into public.nutrition_template_translations (goal, locale, content) values
('lose', 'sr', $${"summary":"Primer dana za mršavljenje: puno proteina i povrća, umerene porcije ugljenih hidrata. Količine prilagodi svojim ciljnim kalorijama.","meals":[
 {"name":"Doručak","time":"08:00","options":[
  {"title":"Omlet sa povrćem","ingredients":["3 jaja","paprika i paradajz","1 kriška integralnog hleba"],"kcal":380,"proteinG":25},
  {"title":"Grčki jogurt sa ovsenim pahuljicama","ingredients":["250 g grčkog jogurta","40 g ovsenih pahuljica","šaka bobičastog voća"],"kcal":360,"proteinG":28}]},
 {"name":"Ručak","time":"13:00","options":[
  {"title":"Piletina sa povrćem i pirinčem","ingredients":["150 g pilećeg belog mesa","80 g pirinča (suvo)","brokoli i šargarepa"],"kcal":520,"proteinG":45},
  {"title":"Ćuretina sa salatom i krompirom","ingredients":["150 g ćuretine","200 g kuvanog krompira","zelena salata, maslinovo ulje 1 kašika"],"kcal":500,"proteinG":42}]},
 {"name":"Užina","time":"16:30","options":[
  {"title":"Posni sir i voće","ingredients":["200 g posnog sira","1 jabuka"],"kcal":250,"proteinG":26},
  {"title":"Proteinski šejk","ingredients":["1 merica proteina","300 ml mleka 1,5%"],"kcal":250,"proteinG":32}]},
 {"name":"Večera","time":"20:00","options":[
  {"title":"Riba sa grilovanim povrćem","ingredients":["180 g oslića ili lososa","tikvica, paprika, patlidžan"],"kcal":380,"proteinG":36},
  {"title":"Tuna salata","ingredients":["1 konzerva tunjevine u sopstvenom soku","pasulj 100 g","krastavac, paradajz, luk"],"kcal":360,"proteinG":38}]}],
"tips":["Pij 2-3 litra vode dnevno.","Najveći obrok sa ugljenim hidratima pojedi 1-3 sata pre treninga.","Povrće uz svaki obrok drži sitost."]}$$::jsonb),
('maintain', 'sr', $${"summary":"Primer uravnoteženog dana: proteini u svakom obroku, dovoljno ugljenih hidrata za trening.","meals":[
 {"name":"Doručak","time":"08:00","options":[
  {"title":"Ovsena kaša","ingredients":["70 g ovsenih pahuljica","300 ml mleka","1 banana","1 kašika putera od kikirikija"],"kcal":550,"proteinG":22},
  {"title":"Jaja i integralni hleb","ingredients":["3 jaja","2 kriške integralnog hleba","sir 30 g","povrće"],"kcal":520,"proteinG":30}]},
 {"name":"Ručak","time":"13:00","options":[
  {"title":"Junetina sa pirinčem","ingredients":["150 g junetine","100 g pirinča (suvo)","sezonska salata"],"kcal":700,"proteinG":45},
  {"title":"Piletina sa testeninom","ingredients":["150 g piletine","100 g integralne testenine","paradajz sos"],"kcal":680,"proteinG":48}]},
 {"name":"Užina","time":"16:30","options":[
  {"title":"Jogurt, voće i orašasti plodovi","ingredients":["250 g jogurta","1 voćka","20 g oraha"],"kcal":330,"proteinG":14},
  {"title":"Sendvič sa ćuretinom","ingredients":["2 kriške hleba","80 g ćuretine","povrće"],"kcal":340,"proteinG":25}]},
 {"name":"Večera","time":"20:00","options":[
  {"title":"Losos i krompir","ingredients":["150 g lososa","250 g krompira","zelena salata"],"kcal":560,"proteinG":35},
  {"title":"Omlet i salata","ingredients":["3 jaja","sir 40 g","salata sa maslinovim uljem"],"kcal":480,"proteinG":30}]}],
"tips":["Jedi u približno isto vreme svakog dana.","Posle treninga uzmi obrok sa proteinima i ugljenim hidratima.","Prati telesnu težinu jednom nedeljno."]}$$::jsonb),
('gain', 'sr', $${"summary":"Primer dana za dobijanje mišićne mase: mali kalorijski višak, proteini u svakom obroku i više ugljenih hidrata oko treninga.","meals":[
 {"name":"Doručak","time":"08:00","options":[
  {"title":"Ovsena kaša sa proteinom","ingredients":["100 g ovsenih pahuljica","400 ml mleka","1 merica proteina","1 banana"],"kcal":800,"proteinG":50},
  {"title":"Jaja, hleb i avokado","ingredients":["4 jaja","3 kriške integralnog hleba","1/2 avokada"],"kcal":780,"proteinG":38}]},
 {"name":"Ručak","time":"13:00","options":[
  {"title":"Junetina, pirinač i povrće","ingredients":["200 g junetine","130 g pirinča (suvo)","povrće, maslinovo ulje"],"kcal":950,"proteinG":60},
  {"title":"Piletina sa testeninom","ingredients":["200 g piletine","130 g testenine","sos od paradajza, parmezan"],"kcal":920,"proteinG":62}]},
 {"name":"Užina","time":"16:30","options":[
  {"title":"Sendvič i mleko","ingredients":["2 kriške hleba","100 g piletine ili tunjevine","400 ml mleka"],"kcal":560,"proteinG":45},
  {"title":"Posni sir, med i orasi","ingredients":["250 g posnog sira","1 kašika meda","30 g oraha"],"kcal":520,"proteinG":35}]},
 {"name":"Večera","time":"20:00","options":[
  {"title":"Losos, krompir i salata","ingredients":["180 g lososa","300 g krompira","salata"],"kcal":720,"proteinG":42},
  {"title":"Ćuretina sa pirinčem","ingredients":["180 g ćuretine","100 g pirinča (suvo)","povrće"],"kcal":700,"proteinG":48}]}],
"tips":["Povećavaj unos postepeno, oko 0,25-0,5 kg dobitka nedeljno je dobar tempo.","Trening snage 3-5 puta nedeljno je ključan.","Spavaj 7-9 sati."]}$$::jsonb),
('lose', 'en', $${"summary":"Example day for weight loss: plenty of protein and vegetables, moderate carbohydrate portions. Adjust amounts to your calorie target.","meals":[
 {"name":"Breakfast","time":"08:00","options":[
  {"title":"Vegetable omelette","ingredients":["3 eggs","peppers and tomato","1 slice wholegrain bread"],"kcal":380,"proteinG":25},
  {"title":"Greek yogurt with oats","ingredients":["250 g Greek yogurt","40 g oats","a handful of berries"],"kcal":360,"proteinG":28}]},
 {"name":"Lunch","time":"13:00","options":[
  {"title":"Chicken with vegetables and rice","ingredients":["150 g chicken breast","80 g rice (dry)","broccoli and carrots"],"kcal":520,"proteinG":45},
  {"title":"Turkey with salad and potatoes","ingredients":["150 g turkey","200 g boiled potatoes","green salad, 1 tbsp olive oil"],"kcal":500,"proteinG":42}]},
 {"name":"Snack","time":"16:30","options":[
  {"title":"Cottage cheese and fruit","ingredients":["200 g low-fat cottage cheese","1 apple"],"kcal":250,"proteinG":26},
  {"title":"Protein shake","ingredients":["1 scoop protein","300 ml 1.5% milk"],"kcal":250,"proteinG":32}]},
 {"name":"Dinner","time":"20:00","options":[
  {"title":"Fish with grilled vegetables","ingredients":["180 g hake or salmon","courgette, pepper, aubergine"],"kcal":380,"proteinG":36},
  {"title":"Tuna salad","ingredients":["1 can tuna in water","100 g beans","cucumber, tomato, onion"],"kcal":360,"proteinG":38}]}],
"tips":["Drink 2-3 litres of water a day.","Eat your biggest carbohydrate meal 1-3 hours before training.","Vegetables with every meal keep you full."]}$$::jsonb),
('maintain', 'en', $${"summary":"Example balanced day: protein in every meal and enough carbohydrates for training.","meals":[
 {"name":"Breakfast","time":"08:00","options":[
  {"title":"Porridge","ingredients":["70 g oats","300 ml milk","1 banana","1 tbsp peanut butter"],"kcal":550,"proteinG":22},
  {"title":"Eggs and wholegrain bread","ingredients":["3 eggs","2 slices wholegrain bread","30 g cheese","vegetables"],"kcal":520,"proteinG":30}]},
 {"name":"Lunch","time":"13:00","options":[
  {"title":"Beef with rice","ingredients":["150 g beef","100 g rice (dry)","seasonal salad"],"kcal":700,"proteinG":45},
  {"title":"Chicken pasta","ingredients":["150 g chicken","100 g wholegrain pasta","tomato sauce"],"kcal":680,"proteinG":48}]},
 {"name":"Snack","time":"16:30","options":[
  {"title":"Yogurt, fruit and nuts","ingredients":["250 g yogurt","1 piece of fruit","20 g walnuts"],"kcal":330,"proteinG":14},
  {"title":"Turkey sandwich","ingredients":["2 slices bread","80 g turkey","vegetables"],"kcal":340,"proteinG":25}]},
 {"name":"Dinner","time":"20:00","options":[
  {"title":"Salmon and potatoes","ingredients":["150 g salmon","250 g potatoes","green salad"],"kcal":560,"proteinG":35},
  {"title":"Omelette and salad","ingredients":["3 eggs","40 g cheese","salad with olive oil"],"kcal":480,"proteinG":30}]}],
"tips":["Eat at roughly the same times every day.","After training, have a meal with protein and carbohydrates.","Check your weight once a week."]}$$::jsonb),
('gain', 'en', $${"summary":"Example day for building muscle: a small calorie surplus, protein in every meal and more carbohydrates around training.","meals":[
 {"name":"Breakfast","time":"08:00","options":[
  {"title":"Protein porridge","ingredients":["100 g oats","400 ml milk","1 scoop protein","1 banana"],"kcal":800,"proteinG":50},
  {"title":"Eggs, bread and avocado","ingredients":["4 eggs","3 slices wholegrain bread","1/2 avocado"],"kcal":780,"proteinG":38}]},
 {"name":"Lunch","time":"13:00","options":[
  {"title":"Beef, rice and vegetables","ingredients":["200 g beef","130 g rice (dry)","vegetables, olive oil"],"kcal":950,"proteinG":60},
  {"title":"Chicken pasta","ingredients":["200 g chicken","130 g pasta","tomato sauce, parmesan"],"kcal":920,"proteinG":62}]},
 {"name":"Snack","time":"16:30","options":[
  {"title":"Sandwich and milk","ingredients":["2 slices bread","100 g chicken or tuna","400 ml milk"],"kcal":560,"proteinG":45},
  {"title":"Cottage cheese, honey and walnuts","ingredients":["250 g cottage cheese","1 tbsp honey","30 g walnuts"],"kcal":520,"proteinG":35}]},
 {"name":"Dinner","time":"20:00","options":[
  {"title":"Salmon, potatoes and salad","ingredients":["180 g salmon","300 g potatoes","salad"],"kcal":720,"proteinG":42},
  {"title":"Turkey with rice","ingredients":["180 g turkey","100 g rice (dry)","vegetables"],"kcal":700,"proteinG":48}]}],
"tips":["Increase intake gradually; 0.25-0.5 kg gain per week is a good pace.","Strength training 3-5 times a week is key.","Sleep 7-9 hours."]}$$::jsonb),
('lose', 'ru', $${"summary":"Пример дня для снижения веса: много белка и овощей, умеренные порции углеводов. Подстройте количество под свою норму калорий.","meals":[
 {"name":"Завтрак","time":"08:00","options":[
  {"title":"Омлет с овощами","ingredients":["3 яйца","перец и помидор","1 ломтик цельнозернового хлеба"],"kcal":380,"proteinG":25},
  {"title":"Греческий йогурт с овсянкой","ingredients":["250 г греческого йогурта","40 г овсяных хлопьев","горсть ягод"],"kcal":360,"proteinG":28}]},
 {"name":"Обед","time":"13:00","options":[
  {"title":"Курица с овощами и рисом","ingredients":["150 г куриной грудки","80 г риса (сухого)","брокколи и морковь"],"kcal":520,"proteinG":45},
  {"title":"Индейка с салатом и картофелем","ingredients":["150 г индейки","200 г отварного картофеля","зелёный салат, 1 ст. л. оливкового масла"],"kcal":500,"proteinG":42}]},
 {"name":"Перекус","time":"16:30","options":[
  {"title":"Творог и фрукт","ingredients":["200 г нежирного творога","1 яблоко"],"kcal":250,"proteinG":26},
  {"title":"Протеиновый коктейль","ingredients":["1 мерная ложка протеина","300 мл молока 1,5%"],"kcal":250,"proteinG":32}]},
 {"name":"Ужин","time":"20:00","options":[
  {"title":"Рыба с овощами гриль","ingredients":["180 г хека или лосося","кабачок, перец, баклажан"],"kcal":380,"proteinG":36},
  {"title":"Салат с тунцом","ingredients":["1 банка тунца в собственном соку","100 г фасоли","огурец, помидор, лук"],"kcal":360,"proteinG":38}]}],
"tips":["Пейте 2-3 литра воды в день.","Самый углеводный приём пищи - за 1-3 часа до тренировки.","Овощи в каждом приёме пищи дают сытость."]}$$::jsonb),
('maintain', 'ru', $${"summary":"Пример сбалансированного дня: белок в каждом приёме пищи и достаточно углеводов для тренировок.","meals":[
 {"name":"Завтрак","time":"08:00","options":[
  {"title":"Овсяная каша","ingredients":["70 г овсяных хлопьев","300 мл молока","1 банан","1 ст. л. арахисовой пасты"],"kcal":550,"proteinG":22},
  {"title":"Яйца и цельнозерновой хлеб","ingredients":["3 яйца","2 ломтика цельнозернового хлеба","30 г сыра","овощи"],"kcal":520,"proteinG":30}]},
 {"name":"Обед","time":"13:00","options":[
  {"title":"Говядина с рисом","ingredients":["150 г говядины","100 г риса (сухого)","сезонный салат"],"kcal":700,"proteinG":45},
  {"title":"Паста с курицей","ingredients":["150 г курицы","100 г цельнозерновой пасты","томатный соус"],"kcal":680,"proteinG":48}]},
 {"name":"Перекус","time":"16:30","options":[
  {"title":"Йогурт, фрукт и орехи","ingredients":["250 г йогурта","1 фрукт","20 г грецких орехов"],"kcal":330,"proteinG":14},
  {"title":"Сэндвич с индейкой","ingredients":["2 ломтика хлеба","80 г индейки","овощи"],"kcal":340,"proteinG":25}]},
 {"name":"Ужин","time":"20:00","options":[
  {"title":"Лосось и картофель","ingredients":["150 г лосося","250 г картофеля","зелёный салат"],"kcal":560,"proteinG":35},
  {"title":"Омлет и салат","ingredients":["3 яйца","40 г сыра","салат с оливковым маслом"],"kcal":480,"proteinG":30}]}],
"tips":["Ешьте примерно в одно и то же время каждый день.","После тренировки - приём пищи с белком и углеводами.","Взвешивайтесь раз в неделю."]}$$::jsonb),
('gain', 'ru', $${"summary":"Пример дня для набора мышечной массы: небольшой профицит калорий, белок в каждом приёме пищи и больше углеводов вокруг тренировки.","meals":[
 {"name":"Завтрак","time":"08:00","options":[
  {"title":"Овсянка с протеином","ingredients":["100 г овсяных хлопьев","400 мл молока","1 мерная ложка протеина","1 банан"],"kcal":800,"proteinG":50},
  {"title":"Яйца, хлеб и авокадо","ingredients":["4 яйца","3 ломтика цельнозернового хлеба","1/2 авокадо"],"kcal":780,"proteinG":38}]},
 {"name":"Обед","time":"13:00","options":[
  {"title":"Говядина, рис и овощи","ingredients":["200 г говядины","130 г риса (сухого)","овощи, оливковое масло"],"kcal":950,"proteinG":60},
  {"title":"Паста с курицей","ingredients":["200 г курицы","130 г пасты","томатный соус, пармезан"],"kcal":920,"proteinG":62}]},
 {"name":"Перекус","time":"16:30","options":[
  {"title":"Сэндвич и молоко","ingredients":["2 ломтика хлеба","100 г курицы или тунца","400 мл молока"],"kcal":560,"proteinG":45},
  {"title":"Творог, мёд и орехи","ingredients":["250 г творога","1 ст. л. мёда","30 г грецких орехов"],"kcal":520,"proteinG":35}]},
 {"name":"Ужин","time":"20:00","options":[
  {"title":"Лосось, картофель и салат","ingredients":["180 г лосося","300 г картофеля","салат"],"kcal":720,"proteinG":42},
  {"title":"Индейка с рисом","ingredients":["180 г индейки","100 г риса (сухого)","овощи"],"kcal":700,"proteinG":48}]}],
"tips":["Увеличивайте питание постепенно: прибавка 0,25-0,5 кг в неделю - хороший темп.","Силовые тренировки 3-5 раз в неделю - главное.","Спите 7-9 часов."]}$$::jsonb);
