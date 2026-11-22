import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { InviteStaffBody, RolesDto, StaffDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import type { AuthAdmin } from './auth-admin';

const OWNER = 'owner';
const MEMBER = 'member';

async function staffList(tx: Tx, userId?: string): Promise<StaffDto[]> {
  const rows = await sql<{
    user_id: string;
    email: string | null;
    first_name: string;
    last_name: string;
    roles: string[];
    deactivated: boolean;
    trainer_id: string | null;
    created_at: Date;
  }>`
    select p.id as user_id, public.account_email(p.id) as email, p.first_name, p.last_name,
           coalesce(array_agg(r.key order by r.key) filter (where r.key is not null), '{}') as roles,
           coalesce(sp.deactivated_at is not null, false) as deactivated,
           (select t.id from public.trainers t where t.user_id = p.id) as trainer_id,
           p.created_at
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    left join public.roles r on r.id = ur.role_id and r.key <> ${MEMBER}
    left join public.staff_profiles sp on sp.user_id = p.id
    where (exists (select 1 from public.user_roles x join public.roles rx on rx.id = x.role_id
                   where x.user_id = p.id and rx.key <> ${MEMBER})
           or sp.user_id is not null)
    ${userId ? sql`and p.id = ${userId}` : sql``}
    group by p.id, sp.deactivated_at
    order by p.first_name, p.last_name`
    .execute(tx)
    .then((r) => r.rows);
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    roles: r.roles,
    deactivated: r.deactivated,
    trainerId: r.trainer_id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

async function owners(tx: Tx) {
  return sql<{ n: number }>`
    select count(distinct ur.user_id)::int as n from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    left join public.staff_profiles sp on sp.user_id = ur.user_id
    where r.key = ${OWNER} and sp.deactivated_at is null`
    .execute(tx)
    .then((r) => r.rows[0]!.n);
}

/** Replaces a user's staff roles; members keep their member role. */
async function setRoles(tx: Tx, actor: Actor, userId: string, roles: string[]) {
  const wanted = [...new Set(roles)].filter((r) => r !== MEMBER);
  const current = await tx
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select('r.key')
    .where('ur.user_id', '=', userId)
    .execute()
    .then((x) => x.map((r) => r.key));
  const touchesOwner = wanted.includes(OWNER) !== current.includes(OWNER);
  if (touchesOwner && !actor.roles.includes(OWNER))
    throw new AppError('FORBIDDEN', 'errors.staff.owner_only');
  const known = wanted.length
    ? await tx.selectFrom('roles').select(['id', 'key']).where('key', 'in', wanted).execute()
    : [];
  if (known.length !== wanted.length)
    throw new AppError('VALIDATION_ERROR', 'errors.staff.unknown_role');
  await sql`delete from public.user_roles ur using public.roles r
            where r.id = ur.role_id and ur.user_id = ${userId} and r.key <> ${MEMBER}`.execute(tx);
  if (known.length)
    await tx
      .insertInto('user_roles')
      .values(known.map((r) => ({ user_id: userId, role_id: r.id, granted_by: actor.userId })))
      .execute();
  if (current.includes(OWNER) && !wanted.includes(OWNER) && (await owners(tx)) === 0)
    throw new AppError('BUSINESS_RULE', 'errors.staff.last_owner');
}

async function linkTrainer(tx: Tx, userId: string, trainerId: string | null | undefined) {
  if (trainerId === undefined) return;
  await tx.updateTable('trainers').set({ user_id: null }).where('user_id', '=', userId).execute();
  if (trainerId) {
    const r = await tx
      .updateTable('trainers')
      .set({ user_id: userId })
      .where('id', '=', trainerId)
      .executeTakeFirst();
    if (!Number(r.numUpdatedRows)) throw notFound('trainer');
  }
}

export function createStaffService(db: Kysely<DB>, authAdmin: AuthAdmin) {
  return {
    list: () => withStaffTx(db, (tx) => staffList(tx)),
    invite: (actor: Actor, req: Request, b: InviteStaffBody) =>
      withStaffTx(db, async (tx) => {
        // The auth user is created first (outside SQL for Supabase); the profile row comes from
        // the auth trigger, so make sure it exists before attaching roles.
        const userId = await authAdmin.invite(b.email, {
          first_name: b.firstName,
          last_name: b.lastName,
        });
        await sql`insert into public.profiles (id, first_name, last_name) values (${userId}, ${b.firstName}, ${b.lastName})
                  on conflict (id) do nothing`.execute(tx);
        await tx
          .insertInto('staff_profiles')
          .values({ user_id: userId })
          .onConflict((oc) =>
            oc.columns(['club_id', 'user_id']).doUpdateSet({ deactivated_at: null }),
          )
          .execute();
        await setRoles(tx, actor, userId, b.roles);
        await linkTrainer(tx, userId, b.trainerId);
        await writeAudit(tx, actor, req, {
          action: 'staff.invite',
          entityType: 'profile',
          entityId: userId,
          diff: { after: { email: b.email, roles: b.roles } },
        });
        return (await staffList(tx, userId))[0]!;
      }),
    update: (
      actor: Actor,
      req: Request,
      userId: string,
      roles: string[],
      trainerId?: string | null,
    ) =>
      withStaffTx(db, async (tx) => {
        if (userId === actor.userId)
          throw new AppError('BUSINESS_RULE', 'errors.staff.not_yourself');
        const exists = await tx
          .selectFrom('profiles')
          .select('id')
          .where('id', '=', userId)
          .executeTakeFirst();
        if (!exists) throw notFound('profile');
        await tx
          .insertInto('staff_profiles')
          .values({ user_id: userId })
          .onConflict((oc) => oc.columns(['club_id', 'user_id']).doNothing())
          .execute();
        await setRoles(tx, actor, userId, roles);
        await linkTrainer(tx, userId, trainerId);
        await writeAudit(tx, actor, req, {
          action: 'staff.roles',
          entityType: 'profile',
          entityId: userId,
          diff: { after: { roles } },
        });
        return (await staffList(tx, userId))[0]!;
      }),
    setActive: (actor: Actor, req: Request, userId: string, active: boolean) =>
      withStaffTx(db, async (tx) => {
        if (userId === actor.userId)
          throw new AppError('BUSINESS_RULE', 'errors.staff.not_yourself');
        const target = await staffList(tx, userId);
        if (!target[0]) throw notFound('profile');
        if (target[0].roles.includes(OWNER) && !actor.roles.includes(OWNER))
          throw new AppError('FORBIDDEN', 'errors.staff.owner_only');
        await tx
          .insertInto('staff_profiles')
          .values({ user_id: userId, deactivated_at: active ? null : new Date() })
          .onConflict((oc) =>
            oc
              .columns(['club_id', 'user_id'])
              .doUpdateSet({ deactivated_at: active ? null : new Date() }),
          )
          .execute();
        if (!active && target[0].roles.includes(OWNER) && (await owners(tx)) === 0)
          throw new AppError('BUSINESS_RULE', 'errors.staff.last_owner');
        await writeAudit(tx, actor, req, {
          action: active ? 'staff.activate' : 'staff.deactivate',
          entityType: 'profile',
          entityId: userId,
          diff: null,
        });
        return (await staffList(tx, userId))[0]!;
      }),

    roles: () =>
      withStaffTx(db, async (tx): Promise<RolesDto> => {
        const roles = await sql<{
          key: string;
          name: string | null;
          is_system: boolean;
          permissions: string[];
          users: number;
        }>`
          select r.key, r.name, r.is_system,
                 coalesce(array_agg(distinct rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions,
                 (select count(*)::int from public.user_roles ur where ur.role_id = r.id) as users
          from public.roles r left join public.role_permissions rp on rp.role_id = r.id
          where r.key <> ${MEMBER}
          group by r.id order by r.is_system desc, r.created_at, r.key`
          .execute(tx)
          .then((x) => x.rows);
        const permissions = await tx
          .selectFrom('permissions')
          .select(['key', 'description'])
          .orderBy('key')
          .execute();
        return {
          roles: roles.map((r) => ({
            key: r.key,
            name: r.name,
            isSystem: r.is_system,
            locked: r.key === OWNER,
            permissions: r.key === OWNER ? permissions.map((p) => p.key) : r.permissions,
            users: r.users,
          })),
          permissions,
        };
      }),
    setRolePermissions: (actor: Actor, req: Request, key: string, permissions: string[]) =>
      withStaffTx(db, async (tx) => {
        if (key === OWNER || key === MEMBER)
          throw new AppError('BUSINESS_RULE', 'errors.staff.role_locked');
        const role = await tx
          .selectFrom('roles')
          .select('id')
          .where('key', '=', key)
          .executeTakeFirst();
        if (!role) throw notFound('role');
        const known = permissions.length
          ? await tx
              .selectFrom('permissions')
              .select('key')
              .where('key', 'in', permissions)
              .execute()
          : [];
        const before = await tx
          .selectFrom('role_permissions')
          .select('permission_key')
          .where('role_id', '=', role.id)
          .execute();
        await tx.deleteFrom('role_permissions').where('role_id', '=', role.id).execute();
        if (known.length)
          await tx
            .insertInto('role_permissions')
            .values(known.map((p) => ({ role_id: role.id, permission_key: p.key })))
            .execute();
        await writeAudit(tx, actor, req, {
          action: 'role.permissions',
          entityType: 'role',
          entityId: role.id,
          diff: {
            before: { permissions: before.map((p) => p.permission_key) },
            after: { permissions: known.map((p) => p.key) },
          },
        });
        return { ok: true as const };
      }),
    createRole: (
      actor: Actor,
      req: Request,
      b: { key: string; name: string; copyFrom?: string | null },
    ) =>
      withStaffTx(db, async (tx) => {
        const dup = await tx
          .selectFrom('roles')
          .select('id')
          .where('key', '=', b.key)
          .executeTakeFirst();
        if (dup) throw new AppError('CONFLICT', 'errors.staff.role_exists');
        const role = await tx
          .insertInto('roles')
          .values({ key: b.key, name: b.name, is_system: false })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (b.copyFrom && b.copyFrom !== OWNER) {
          await sql`insert into public.role_permissions (role_id, permission_key)
                    select ${role.id}, rp.permission_key from public.role_permissions rp
                    join public.roles r on r.id = rp.role_id where r.key = ${b.copyFrom}`.execute(
            tx,
          );
        }
        await writeAudit(tx, actor, req, {
          action: 'role.create',
          entityType: 'role',
          entityId: role.id,
          diff: { after: { key: b.key, name: b.name } },
        });
        return { ok: true as const };
      }),
    deleteRole: (actor: Actor, req: Request, key: string) =>
      withStaffTx(db, async (tx) => {
        const role = await tx
          .selectFrom('roles')
          .select(['id', 'is_system'])
          .where('key', '=', key)
          .executeTakeFirst();
        if (!role) throw notFound('role');
        if (role.is_system) throw new AppError('BUSINESS_RULE', 'errors.staff.role_locked');
        const used = await tx
          .selectFrom('user_roles')
          .select('user_id')
          .where('role_id', '=', role.id)
          .executeTakeFirst();
        if (used) throw new AppError('BUSINESS_RULE', 'errors.staff.role_in_use');
        await tx.deleteFrom('roles').where('id', '=', role.id).execute();
        await writeAudit(tx, actor, req, {
          action: 'role.delete',
          entityType: 'role',
          entityId: role.id,
          diff: { before: { key } },
        });
        return { ok: true as const };
      }),
  };
}
