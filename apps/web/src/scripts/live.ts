import {
  formatPrice,
  groupByDay,
  openStatus,
  safeUrl,
  telHref,
  weekOrder,
  type PublicClass,
} from '../lib/club';
import type { ClubData } from '../lib/api';

/**
 * Fills the page with live club data from the public API (name, hours, photos, plans,
 * schedule, trainers). Everything from the admin is inserted as text, never as HTML.
 */
type Text = {
  locale: 'sr' | 'en' | 'ru';
  status: {
    open: string;
    until: string;
    closed: string;
    opens: string;
    today: string;
    tomorrow: string;
  };
  days: string[];
  daysShort: string[];
  closed: string;
  plans: { unlimited: string; choose: string; empty: string };
  schedule: { spots: string; full: string; empty: string };
  trainersPt: string;
  joinUrl: string;
};
type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  durationDays: number | null;
  visitLimit: number | null;
};
type Trainer = {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  bio: string | null;
  offersPersonalTraining: boolean;
  photoUrl: string | null;
};

const INTL: Record<Text['locale'], string> = { sr: 'sr-Latn-RS', en: 'en-GB', ru: 'ru-RU' };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Array<Node | null | undefined | false> = [],
) {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const one = (sel: string) => document.querySelector<HTMLElement>(sel);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function get<T>(api: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${api}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return ((await res.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

function hideWrap(key: string, hidden: boolean) {
  for (const el of all(`[data-live-wrap="${key}"]`)) el.hidden = hidden;
}

function renderClub(c: ClubData, t: Text) {
  const name = str(c.info.name);
  if (name) for (const el of all('[data-live="name"]')) el.textContent = name;
  const tagline = str(c.info.tagline);
  for (const el of all('[data-live="tagline"]')) el.textContent = tagline ?? '';

  const logo = one('[data-live="logo"]') as HTMLImageElement | null;
  if (logo && c.logoUrl) logo.src = c.logoUrl;
  const hero = one('[data-live="hero"]') as HTMLImageElement | null;
  if (hero && c.loginImageUrl) hero.src = c.loginImageUrl;

  const address = str(c.info.address);
  hideWrap('address', !address);
  for (const el of all('[data-live="address"]')) el.textContent = address ?? '';
  const maps = one('[data-live="maps"]') as HTMLAnchorElement | null;
  if (maps && address)
    maps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const phone = str(c.info.phone);
  hideWrap('phone', !phone);
  const tel = one('[data-live="phone"]') as HTMLAnchorElement | null;
  if (tel && phone) {
    tel.textContent = phone;
    tel.href = telHref(phone);
  }
  const email = str(c.info.email);
  hideWrap('email', !email);
  const mail = one('[data-live="email"]') as HTMLAnchorElement | null;
  if (mail && email) {
    mail.textContent = email;
    mail.href = `mailto:${email}`;
  }
  const ig = safeUrl(c.info.instagram);
  const fb = safeUrl(c.info.facebook);
  for (const [key, url] of [
    ['instagram', ig],
    ['facebook', fb],
  ] as const) {
    const a = one(`[data-live="${key}"]`) as HTMLAnchorElement | null;
    if (!a) continue;
    a.hidden = !url;
    if (url) a.href = url;
  }
  hideWrap('social', !ig && !fb);

  // Open now / closed, in club time.
  const s = openStatus(c.openingHours, new Date());
  const status = one('[data-live="status"]');
  if (status) {
    const dot = h('span', {
      class: `size-2 rounded-full ${s.open ? 'bg-status-success shadow-[0_0_0_4px_rgba(43,213,118,0.2)]' : 'bg-status-danger'}`,
    });
    const label = s.open
      ? `${t.status.open} · ${t.status.until} ${s.until}`
      : s.next
        ? `${t.status.closed} · ${t.status.opens} ${
            s.next.dayOffset === 0
              ? t.status.today
              : s.next.dayOffset === 1
                ? t.status.tomorrow
                : t.days[s.next.weekday]!.toLowerCase()
          } ${s.next.at}`
        : t.status.closed;
    status.replaceChildren(dot, document.createTextNode(label));
  }

  // Opening hours table, today highlighted.
  const table = one('[data-live="hours"]');
  if (table) {
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'Europe/Belgrade',
      weekday: 'short',
    });
    const todayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(today);
    const body = h(
      'tbody',
      { class: 'divide-y divide-border-subtle' },
      weekOrder(c.openingHours).map((d) =>
        h('tr', { class: d.weekday === todayIdx ? 'text-accent-400 font-bold' : '' }, [
          h('td', { class: 'py-3 pe-4', text: t.days[d.weekday] }),
          h('td', {
            class: 'py-3 text-end tabular-nums',
            text: d.isClosed || !d.opensAt ? t.closed : `${d.opensAt} - ${d.closesAt}`,
          }),
        ]),
      ),
    );
    table.replaceChildren(body);
  }

  // Photos: first one large, captions in the page language.
  const grid = one('[data-live="photos"]');
  if (grid) {
    const photos = [...c.photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 7);
    if (!photos.length) {
      const section = document.getElementById('space');
      if (section) section.hidden = true;
    } else {
      grid.replaceChildren(
        ...photos.map((p, i) => {
          const caption = p.captions[t.locale] ?? p.captions.sr ?? '';
          return h(
            'figure',
            {
              class: `group relative overflow-hidden rounded-md bg-bg-surface2 ${i === 0 ? 'col-span-2 row-span-2' : ''}`,
            },
            [
              h('img', {
                class:
                  'size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]',
                attrs: { src: p.url, alt: caption, loading: 'lazy', decoding: 'async' },
              }),
              caption
                ? h(
                    'figcaption',
                    {
                      class:
                        'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10 text-sm font-semibold',
                    },
                    [document.createTextNode(caption)],
                  )
                : null,
            ],
          );
        }),
      );
    }
  }
}

function renderPlans(
  plans: Plan[] | null,
  t: Text,
  d: { days: (n: number) => string; visits: (n: number) => string },
) {
  const box = one('[data-live="plans"]');
  if (!box) return;
  if (!plans?.length) {
    box.replaceChildren(h('p', { class: 'text-white/60', text: t.plans.empty }));
    return;
  }
  box.replaceChildren(
    ...plans.map((p) =>
      h(
        'article',
        {
          class:
            'flex flex-col rounded-md border border-border-subtle bg-bg-surface p-7 transition-colors hover:border-accent-500/60',
        },
        [
          h('h3', { class: 'text-lg font-bold', text: p.name }),
          h('p', {
            class: 'mt-1 text-sm text-white/60',
            text: [
              p.durationDays ? d.days(p.durationDays) : null,
              p.visitLimit ? d.visits(p.visitLimit) : t.plans.unlimited,
            ]
              .filter(Boolean)
              .join(' · '),
          }),
          p.description
            ? h('p', { class: 'mt-4 text-sm text-white/70', text: p.description })
            : null,
          h('p', {
            class: 'display mt-8 text-[1.9rem] text-white',
            text: formatPrice(p.priceAmount, p.currency, INTL[t.locale]),
          }),
          h('a', {
            class: 'btn btn-ghost mt-6 w-full',
            text: t.plans.choose,
            attrs: { href: t.joinUrl },
          }),
        ],
      ),
    ),
  );
}

function renderSchedule(classes: PublicClass[] | null, t: Text) {
  const box = one('[data-live="schedule"]');
  if (!box) return;
  const days = groupByDay(classes ?? []);
  if (!days.length) {
    box.replaceChildren(h('p', { class: 'text-white/60', text: t.schedule.empty }));
    return;
  }
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(INTL[t.locale], {
      timeZone: 'Europe/Belgrade',
      hour: '2-digit',
      minute: '2-digit',
    });
  box.replaceChildren(
    ...days.map(({ date, items }) => {
      const d = new Date(`${date}T12:00:00Z`);
      return h(
        'div',
        { class: 'w-64 shrink-0 snap-start rounded-md border border-border-subtle bg-bg-base p-4' },
        [
          h('p', { class: 'flex items-baseline justify-between' }, [
            h('span', {
              class: 'text-sm font-bold tracking-widest uppercase',
              text: t.daysShort[d.getUTCDay()],
            }),
            h('span', {
              class: 'text-xs text-white/50 tabular-nums',
              text: `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`,
            }),
          ]),
          h(
            'ul',
            { class: 'mt-4 flex flex-col gap-2' },
            items.map((c) =>
              h('li', { class: 'relative overflow-hidden rounded-sm bg-bg-surface p-3 ps-4' }, [
                h('span', {
                  class: 'absolute inset-y-0 start-0 w-1',
                  attrs: {
                    style: `background:${/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#E54E26'}`,
                  },
                }),
                h('p', { class: 'flex justify-between gap-2 text-sm' }, [
                  h('span', { class: 'font-bold', text: c.typeName }),
                  h('span', { class: 'tabular-nums text-white/70', text: time(c.startsAt) }),
                ]),
                h('p', {
                  class: `mt-1 text-xs ${c.spotsLeft > 0 ? 'text-white/50' : 'text-status-warning'}`,
                  text: [
                    c.trainer?.name ?? null,
                    c.spotsLeft > 0 ? `${c.spotsLeft} ${t.schedule.spots}` : t.schedule.full,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }),
              ]),
            ),
          ),
        ],
      );
    }),
  );
}

function renderTrainers(trainers: Trainer[] | null, t: Text) {
  const box = one('[data-live="trainers"]');
  const section = document.getElementById('trainers');
  if (!box) return;
  if (!trainers?.length) {
    if (section) section.hidden = true;
    return;
  }
  box.replaceChildren(
    ...trainers.map((tr) =>
      h(
        'article',
        { class: 'group overflow-hidden rounded-md border border-border-subtle bg-bg-surface' },
        [
          h('div', { class: 'aspect-[4/5] overflow-hidden bg-bg-surface2' }, [
            tr.photoUrl
              ? h('img', {
                  class:
                    'size-full object-cover grayscale transition duration-500 group-hover:grayscale-0',
                  attrs: {
                    src: tr.photoUrl,
                    alt: `${tr.firstName} ${tr.lastName}`,
                    loading: 'lazy',
                  },
                })
              : h('div', {
                  class: 'display grid size-full place-items-center text-5xl text-white/15',
                  text: `${tr.firstName[0] ?? ''}${tr.lastName[0] ?? ''}`,
                }),
          ]),
          h('div', { class: 'p-6' }, [
            h('h3', { class: 'text-lg font-bold', text: `${tr.firstName} ${tr.lastName}` }),
            tr.title
              ? h('p', { class: 'mt-1 text-sm font-semibold text-accent-400', text: tr.title })
              : null,
            tr.bio
              ? h('p', {
                  class: 'mt-3 line-clamp-4 text-sm leading-relaxed text-white/65',
                  text: tr.bio,
                })
              : null,
            tr.offersPersonalTraining
              ? h('p', {
                  class:
                    'mt-4 inline-flex rounded-xs border border-accent-500/40 bg-accent-tint px-2 py-1 text-[11px] font-bold tracking-wider text-accent-400 uppercase',
                  text: t.trainersPt,
                })
              : null,
          ]),
        ],
      ),
    ),
  );
}

export async function start() {
  const cfgEl = document.getElementById('grit-config');
  if (!cfgEl?.textContent) return;
  const { api, text } = JSON.parse(cfgEl.textContent) as { api: string; text: Text };

  // Header turns solid after the hero.
  const header = one('[data-header]');
  const onScroll = () => header?.setAttribute('data-solid', String(window.scrollY > 40));
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const { dict } = await import('../lib/i18n');
  const d = dict[text.locale].plans;
  const from = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
  const toDate = new Date(Date.now() + 6 * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Belgrade',
  });
  const q = `locale=${text.locale}`;
  const [club, plans, classes, trainers] = await Promise.all([
    get<ClubData>(api, `/public/club?${q}`),
    get<Plan[]>(api, `/public/plans?${q}`),
    get<PublicClass[]>(api, `/public/classes?from=${from}&to=${toDate}&${q}`),
    get<Trainer[]>(api, `/public/trainers?${q}`),
  ]);
  if (club) renderClub(club, text);
  renderPlans(plans, text, d);
  renderSchedule(classes, text);
  renderTrainers(trainers, text);
}
