import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  ClubStatus,
  MyClubDto,
  PlatformClubDto,
  PublicClubDto,
  RegisterClubBody,
} from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

/** "Fit Zona Novi Sad!" -> "fit-zona-novi-sad" (Serbian letters folded to ASCII). */
export function slugify(name: string): string {
  const map: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };
  const s = name
    .toLowerCase()
    .replace(/[čćšžđ]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s.length >= 2 ? s : `klub-${s}`.slice(0, 40);
}

const MAX_PENDING_PER_PERSON = 3;

export function createClubsService(db: Kysely<DB>) {
  const platformList = (status?: ClubStatus) =>
    withStaffTx(db, async (tx): Promise<PlatformClubDto[]> => {
      const rows = await sql<{
        id: string;
        slug: string;
        name: string;
        city: string | null;
        address: string | null;
        phone: string | null;
        email: string | null;
        status: ClubStatus;
        is_default: boolean;
        owner_name: string | null;
        owner_email: string | null;
        members: number | null;
        created_at: Date;
        approved_at: Date | null;
        suspended_reason: string | null;
      }>`
        select c.id, c.slug, c.name, c.city, c.address, c.phone, c.email, c.status, c.is_default,
               nullif(trim(p.first_name || ' ' || p.last_name), '') as owner_name,
               public.account_email(c.owner_user_id) as owner_email,
               mc.members::int as members, c.created_at, c.approved_at, c.suspended_reason
        from public.clubs c
        left join public.profiles p on p.id = c.owner_user_id
        left join public.club_member_counts() mc on mc.club_id = c.id
        where (${status ?? null}::text is null or c.status = ${status ?? null})
        order by (c.status = 'pending') desc, c.created_at desc`
        .execute(tx)
        .then((r) => r.rows);
      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        city: r.city,
        address: r.address,
        phone: r.phone,
        email: r.email,
        status: r.status,
        isDefault: r.is_default,
        ownerName: r.owner_name,
        ownerEmail: r.owner_email,
        members: r.members ?? 0,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
        suspendedReason: r.suspended_reason,
      }));
    });

  const setStatus = (
    actor: Actor,
    req: Request,
    id: string,
    status: ClubStatus,
    reason: string | null,
  ) =>
    withStaffTx(db, async (tx) => {
      const club = await tx
        .selectFrom('clubs')
        .select(['id', 'is_default', 'status'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!club) throw notFound('club');
      if (club.is_default && status === 'suspended')
        throw new AppError('BUSINESS_RULE', 'errors.club.default_locked');
      await tx
        .updateTable('clubs')
        .set({
          status,
          suspended_reason: status === 'suspended' ? reason : null,
          ...(status === 'active' && club.status === 'pending' && { approved_at: new Date() }),
        })
        .where('id', '=', id)
        .execute();
      await writeAudit(tx, actor, req, {
        action: `club.${status === 'active' ? (club.status === 'pending' ? 'approve' : 'reactivate') : 'suspend'}`,
        entityType: 'club',
        entityId: id,
        diff: { before: { status: club.status }, after: { status, reason } },
      });
    });

  return {
    /** Anyone signed in can open a gym; it waits for the platform owner's approval. */
    register: (actor: Actor, req: Request, b: RegisterClubBody) =>
      withStaffTx(db, async (tx): Promise<MyClubDto> => {
        const pending = await tx
          .selectFrom('clubs')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('owner_user_id', '=', actor.userId)
          .where('status', '=', 'pending')
          .executeTakeFirstOrThrow();
        if (Number(pending.n) >= MAX_PENDING_PER_PERSON)
          throw new AppError('BUSINESS_RULE', 'errors.club.too_many_pending');

        // Explicit slug must be free; a generated one gets a number until it is.
        let slug = b.slug ?? slugify(b.name);
        const taken = async (s: string) =>
          Boolean(
            await tx.selectFrom('clubs').select('id').where('slug', '=', s).executeTakeFirst(),
          );
        if (await taken(slug)) {
          if (b.slug) throw new AppError('CONFLICT', 'errors.club.slug_taken');
          let i = 2;
          while (await taken(`${slug.slice(0, 36)}-${i}`)) i += 1;
          slug = `${slug.slice(0, 36)}-${i}`;
        }
        const club = await tx
          .insertInto('clubs')
          .values({
            slug,
            name: b.name,
            city: b.city,
            address: b.address ?? null,
            phone: b.phone ?? null,
            email: b.email ?? null,
            status: 'pending',
            owner_user_id: actor.userId,
          })
          .returning(['id', 'slug', 'name', 'city'])
          .executeTakeFirstOrThrow();
        await sql`select public.bootstrap_club(${club.id}, ${actor.userId})`.execute(tx);
        await writeAudit(tx, actor, req, {
          action: 'club.register',
          entityType: 'club',
          entityId: club.id,
          diff: { after: { name: b.name, slug, city: b.city } },
        });
        return { ...club, status: 'pending', roles: ['owner'], isMember: false };
      }),

    mine: (actor: Actor) =>
      withStaffTx(db, async (tx): Promise<MyClubDto[]> => {
        const rows = await sql<{
          id: string;
          slug: string;
          name: string;
          city: string | null;
          status: ClubStatus;
          roles: string[];
          is_member: boolean;
        }>`select * from public.my_clubs(${actor.userId})`
          .execute(tx)
          .then((r) => r.rows);
        return rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          city: r.city,
          status: r.status,
          roles: r.roles,
          isMember: r.is_member,
        }));
      }),

    directory: (q?: string) =>
      withStaffTx(db, async (tx): Promise<PublicClubDto[]> => {
        const term = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;
        return tx
          .selectFrom('clubs')
          .select(['id', 'slug', 'name', 'city'])
          .where('status', '=', 'active')
          .$if(Boolean(term), (x) =>
            x.where((eb) =>
              eb.or([
                eb(sql<string>`lower(name)`, 'like', term!),
                eb(sql<string>`lower(coalesce(city, ''))`, 'like', term!),
              ]),
            ),
          )
          .orderBy('name')
          .limit(100)
          .execute();
      }),

    platformList,
    approve: (actor: Actor, req: Request, id: string) => setStatus(actor, req, id, 'active', null),
    reactivate: (actor: Actor, req: Request, id: string) =>
      setStatus(actor, req, id, 'active', null),
    suspend: (actor: Actor, req: Request, id: string, reason: string) =>
      setStatus(actor, req, id, 'suspended', reason),
  };
}
