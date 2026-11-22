/**
 * Website copy. Club facts (name, slogan, hours, contact, prices, trainers, schedule, photos)
 * are NOT here: they come live from the API and are edited in the admin.
 */
export const LOCALES = ['sr', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const localePath = (l: Locale) => (l === 'sr' ? '/' : `/${l}/`);

const sr = {
  meta: {
    title: 'Teretana, CrossFit i boks u Beogradu',
    description:
      'Teretana, CrossFit, boks i kik-boks na jednom mestu. Paketi, raspored treninga, treneri i radno vreme. Učlani se iz aplikacije.',
  },
  nav: {
    why: 'Zašto mi',
    space: 'Prostor',
    plans: 'Paketi',
    schedule: 'Raspored',
    trainers: 'Treneri',
    faq: 'Pitanja',
    contact: 'Kontakt',
  },
  cta: {
    join: 'Postani član',
    plans: 'Paketi i cene',
    app: 'Otvori aplikaciju',
    call: 'Pozovi',
    directions: 'Kako do nas',
  },
  status: {
    open: 'Otvoreno sada',
    until: 'do',
    closed: 'Trenutno zatvoreno',
    opens: 'otvara se',
    today: 'danas',
    tomorrow: 'sutra',
  },
  hero: {
    kicker: 'Fitness centar',
    title: ['Treniraj', 'jače.', 'Prati sve.'],
    text: 'Teretana, CrossFit, boks i kik-boks pod jednim krovom. Ulaz QR kodom, treninzi, ishrana i članarina u jednoj aplikaciji.',
  },
  why: {
    title: 'Sve što ti treba za trening',
    lead: 'Prostor za svaki cilj i aplikacija koja te prati od prvog dana.',
    items: [
      { t: 'Teretana bez čekanja', d: 'Slobodni tegovi, mašine sa pločama, sajle i zona za noge.' },
      {
        t: 'Grupni treninzi',
        d: 'CrossFit, boks i kik-boks sa trenerima, termini se rezervišu u aplikaciji.',
      },
      { t: 'Ulaz telefonom', d: 'QR kod u aplikaciji je tvoja kartica. Bez plastike, bez reda.' },
      {
        t: 'Napredak na jednom mestu',
        d: 'Dnevnik treninga, mere, ciljevi i ishrana, uz plan od trenera.',
      },
    ],
  },
  space: {
    title: 'Mesto gde treniraš',
    lead: 'Zone za snagu, kondiciju i borilačke sportove, opremljene za ozbiljan trening.',
  },
  plans: {
    title: 'Paketi i cene',
    lead: 'Izaberi paket u aplikaciji, a plati na recepciji (gotovina ili kartica).',
    days: (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana'}`,
    visits: (n: number) =>
      `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'dolazak' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'dolaska' : 'dolazaka'}`,
    unlimited: 'neograničeno dolazaka',
    choose: 'Izaberi',
    empty: 'Paketi će uskoro biti objavljeni.',
  },
  schedule: {
    title: 'Raspored grupnih treninga',
    lead: 'Narednih 7 dana. Mesto rezervišeš u aplikaciji.',
    spots: 'mesta',
    full: 'popunjeno',
    empty: 'Nema zakazanih termina ove nedelje.',
  },
  trainers: {
    title: 'Ko te vodi',
    lead: 'Treneri za grupne i personalne treninge.',
    pt: 'Personalni treninzi',
  },
  app: {
    title: 'Klub u tvom telefonu',
    lead: 'Jedna aplikacija za sve: članarina, ulaz, treninzi, ishrana i kafić.',
    items: [
      'QR kod za ulaz',
      'Produženje članarine',
      'Rezervacija termina',
      'Dnevnik treninga i mere',
      'Plan ishrane i kalorije',
      'Poručivanje u kafiću',
    ],
  },
  faq: {
    title: 'Česta pitanja',
    items: [
      {
        q: 'Kako postajem član?',
        a: 'Napravi nalog u aplikaciji i izaberi paket. Zahtev stiže na recepciju, platiš pri dolasku i članarina se odmah aktivira. Može i direktno na recepciji.',
      },
      {
        q: 'Gde i kako se plaća?',
        a: 'Na recepciji, gotovinom ili karticom. Online plaćanje trenutno nije dostupno.',
      },
      {
        q: 'Kako ulazim u teretanu?',
        a: 'Pokažeš QR kod iz aplikacije na ulazu. Kod se menja na svakih nekoliko sekundi, pa ne može da se pozajmi.',
      },
      {
        q: 'Kako se prijavljujem za grupni trening?',
        a: 'U aplikaciji, u rasporedu izabereš termin. Ako je popunjen, staješ na listu čekanja.',
      },
      {
        q: 'Već sam upisan na recepciji, kako da povežem aplikaciju?',
        a: 'Na recepciji dobiješ kod od 6 cifara i uneseš ga u aplikaciji. Tvoje članstvo se odmah pojavi.',
      },
      {
        q: 'Mogu li da obrišem nalog?',
        a: 'Da, u aplikaciji u Podešavanjima. Lični podaci se brišu odmah.',
      },
    ],
  },
  contact: {
    title: 'Kontakt i radno vreme',
    hours: 'Radno vreme',
    closed: 'zatvoreno',
    address: 'Adresa',
    phone: 'Telefon',
    email: 'Email',
    follow: 'Prati nas',
  },
  final: {
    title: 'Prvi trening počinje ovde.',
    text: 'Napravi nalog za minut i dođi na recepciju.',
  },
  days: ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota'],
  daysShort: ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'],
  footer: { rights: 'Sva prava zadržana.', admin: 'Za zaposlene' },
  lang: 'Jezik',
  loading: 'Učitavanje…',
};
type Dict = typeof sr;

const en: Dict = {
  meta: {
    title: 'Gym, CrossFit and boxing in Belgrade',
    description:
      'Gym, CrossFit, boxing and kickboxing in one place. Plans, class schedule, trainers and opening hours. Join from the app.',
  },
  nav: {
    why: 'Why us',
    space: 'Space',
    plans: 'Plans',
    schedule: 'Schedule',
    trainers: 'Trainers',
    faq: 'FAQ',
    contact: 'Contact',
  },
  cta: {
    join: 'Become a member',
    plans: 'Plans and prices',
    app: 'Open the app',
    call: 'Call',
    directions: 'Directions',
  },
  status: {
    open: 'Open now',
    until: 'until',
    closed: 'Closed now',
    opens: 'opens',
    today: 'today',
    tomorrow: 'tomorrow',
  },
  hero: {
    kicker: 'Fitness center',
    title: ['Train', 'harder.', 'Track it all.'],
    text: 'Gym, CrossFit, boxing and kickboxing under one roof. QR entry, workouts, nutrition and your membership in one app.',
  },
  why: {
    title: 'Everything you need to train',
    lead: 'A space for every goal and an app that follows you from day one.',
    items: [
      {
        t: 'A gym without waiting',
        d: 'Free weights, plate-loaded machines, cables and a leg zone.',
      },
      { t: 'Group classes', d: 'CrossFit, boxing and kickboxing with coaches, booked in the app.' },
      { t: 'Entry by phone', d: 'The QR code in the app is your card. No plastic, no queue.' },
      {
        t: 'Progress in one place',
        d: 'Workout log, measurements, goals and nutrition, with a plan from your coach.',
      },
    ],
  },
  space: {
    title: 'Where you train',
    lead: 'Zones for strength, conditioning and combat sports, equipped for serious training.',
  },
  plans: {
    title: 'Plans and prices',
    lead: 'Pick a plan in the app and pay at the front desk (cash or card).',
    days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    visits: (n: number) => `${n} ${n === 1 ? 'visit' : 'visits'}`,
    unlimited: 'unlimited visits',
    choose: 'Choose',
    empty: 'Plans will be published soon.',
  },
  schedule: {
    title: 'Group class schedule',
    lead: 'Next 7 days. Book your spot in the app.',
    spots: 'spots',
    full: 'full',
    empty: 'No classes scheduled this week.',
  },
  trainers: {
    title: 'Who coaches you',
    lead: 'Coaches for group and personal training.',
    pt: 'Personal training',
  },
  app: {
    title: 'The club in your pocket',
    lead: 'One app for everything: membership, entry, workouts, nutrition and the café.',
    items: [
      'QR code entry',
      'Membership renewal',
      'Class booking',
      'Workout log and measurements',
      'Meal plan and calories',
      'Café ordering',
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        q: 'How do I become a member?',
        a: 'Create an account in the app and pick a plan. The request goes to the front desk, you pay when you arrive and it is activated right away. You can also sign up at the desk.',
      },
      {
        q: 'Where and how do I pay?',
        a: 'At the front desk, cash or card. Online payment is not available yet.',
      },
      {
        q: 'How do I get in?',
        a: 'Show the QR code from the app at the entrance. It changes every few seconds, so it cannot be shared.',
      },
      {
        q: 'How do I book a group class?',
        a: 'Pick a class in the app schedule. If it is full, you join the waiting list.',
      },
      {
        q: 'I signed up at the desk. How do I link the app?',
        a: 'Get a 6-digit code at the desk and enter it in the app. Your membership appears right away.',
      },
      {
        q: 'Can I delete my account?',
        a: 'Yes, in the app under Settings. Personal data is deleted immediately.',
      },
    ],
  },
  contact: {
    title: 'Contact and opening hours',
    hours: 'Opening hours',
    closed: 'closed',
    address: 'Address',
    phone: 'Phone',
    email: 'Email',
    follow: 'Follow us',
  },
  final: {
    title: 'Your first workout starts here.',
    text: 'Create an account in a minute and come to the front desk.',
  },
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  footer: { rights: 'All rights reserved.', admin: 'For staff' },
  lang: 'Language',
  loading: 'Loading…',
};

const ruPlural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11
    ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? few
      : many;

const ru: Dict = {
  meta: {
    title: 'Тренажёрный зал, CrossFit и бокс в Белграде',
    description:
      'Тренажёрный зал, CrossFit, бокс и кикбоксинг в одном месте. Абонементы, расписание, тренеры и часы работы. Записывайтесь через приложение.',
  },
  nav: {
    why: 'Почему мы',
    space: 'Зал',
    plans: 'Абонементы',
    schedule: 'Расписание',
    trainers: 'Тренеры',
    faq: 'Вопросы',
    contact: 'Контакты',
  },
  cta: {
    join: 'Стать клиентом',
    plans: 'Абонементы и цены',
    app: 'Открыть приложение',
    call: 'Позвонить',
    directions: 'Как добраться',
  },
  status: {
    open: 'Сейчас открыто',
    until: 'до',
    closed: 'Сейчас закрыто',
    opens: 'откроется',
    today: 'сегодня',
    tomorrow: 'завтра',
  },
  hero: {
    kicker: 'Фитнес-центр',
    title: ['Тренируйся', 'сильнее.', 'Следи за всем.'],
    text: 'Тренажёрный зал, CrossFit, бокс и кикбоксинг под одной крышей. Вход по QR-коду, тренировки, питание и абонемент в одном приложении.',
  },
  why: {
    title: 'Всё для тренировок',
    lead: 'Пространство для любой цели и приложение, которое с вами с первого дня.',
    items: [
      { t: 'Зал без ожидания', d: 'Свободные веса, рычажные тренажёры, блоки и зона для ног.' },
      {
        t: 'Групповые тренировки',
        d: 'CrossFit, бокс и кикбоксинг с тренерами, запись в приложении.',
      },
      {
        t: 'Вход по телефону',
        d: 'QR-код в приложении и есть ваша карта. Без пластика и очередей.',
      },
      {
        t: 'Прогресс в одном месте',
        d: 'Дневник тренировок, замеры, цели и питание, с планом от тренера.',
      },
    ],
  },
  space: {
    title: 'Где вы тренируетесь',
    lead: 'Зоны для силы, выносливости и единоборств, оборудованные для серьёзных тренировок.',
  },
  plans: {
    title: 'Абонементы и цены',
    lead: 'Выберите абонемент в приложении и оплатите на ресепшене (наличные или карта).',
    days: (n: number) => `${n} ${ruPlural(n, 'день', 'дня', 'дней')}`,
    visits: (n: number) => `${n} ${ruPlural(n, 'посещение', 'посещения', 'посещений')}`,
    unlimited: 'безлимитные посещения',
    choose: 'Выбрать',
    empty: 'Абонементы скоро появятся.',
  },
  schedule: {
    title: 'Расписание групповых тренировок',
    lead: 'Ближайшие 7 дней. Место бронируется в приложении.',
    spots: 'мест',
    full: 'мест нет',
    empty: 'На этой неделе тренировок нет.',
  },
  trainers: {
    title: 'Кто вас тренирует',
    lead: 'Тренеры групповых и персональных тренировок.',
    pt: 'Персональные тренировки',
  },
  app: {
    title: 'Клуб в вашем телефоне',
    lead: 'Одно приложение для всего: абонемент, вход, тренировки, питание и кафе.',
    items: [
      'Вход по QR-коду',
      'Продление абонемента',
      'Запись на тренировки',
      'Дневник тренировок и замеры',
      'План питания и калории',
      'Заказ в кафе',
    ],
  },
  faq: {
    title: 'Частые вопросы',
    items: [
      {
        q: 'Как стать клиентом?',
        a: 'Создайте аккаунт в приложении и выберите абонемент. Заявка придёт на ресепшен, вы оплатите при визите, и он сразу активируется. Можно и прямо на ресепшене.',
      },
      {
        q: 'Где и как оплатить?',
        a: 'На ресепшене, наличными или картой. Онлайн-оплата пока недоступна.',
      },
      {
        q: 'Как пройти в зал?',
        a: 'Покажите QR-код из приложения на входе. Код меняется каждые несколько секунд, его нельзя передать.',
      },
      {
        q: 'Как записаться на групповую тренировку?',
        a: 'Выберите тренировку в расписании приложения. Если мест нет, вы попадёте в лист ожидания.',
      },
      {
        q: 'Я записан на ресепшене. Как подключить приложение?',
        a: 'Получите на ресепшене 6-значный код и введите его в приложении. Абонемент появится сразу.',
      },
      {
        q: 'Можно ли удалить аккаунт?',
        a: 'Да, в приложении в Настройках. Личные данные удаляются сразу.',
      },
    ],
  },
  contact: {
    title: 'Контакты и часы работы',
    hours: 'Часы работы',
    closed: 'закрыто',
    address: 'Адрес',
    phone: 'Телефон',
    email: 'Email',
    follow: 'Мы в соцсетях',
  },
  final: {
    title: 'Первая тренировка начинается здесь.',
    text: 'Создайте аккаунт за минуту и приходите на ресепшен.',
  },
  days: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  daysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  footer: { rights: 'Все права защищены.', admin: 'Для сотрудников' },
  lang: 'Язык',
  loading: 'Загрузка…',
};

export const dict: Record<Locale, Dict> = { sr, en, ru };
export type { Dict };
