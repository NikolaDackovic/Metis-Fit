import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { clubContext, currentClubId } from '../../shared/club-context';
import { AppError, notFound } from '../../shared/errors';
import type { MediaStore } from '../../shared/media';
import type { AuthAdmin } from '../staff/auth-admin';

/**
 * Gym data about the person (plans, consents, notes...). On account deletion these rows are removed;
 * personal data on the account (workouts, measurements, food log...) goes with the account itself;
 * payments, memberships, bookings, visits, café orders and service sales stay (bookkeeping),
 * linked to the anonymized member row.
 */
const PERSONAL_TABLES = [
  'workout_plans', // exercises cascade
  'nutrition_plans',
  'member_nutrition_plans',
  'member_consents',
  'member_notes',
  'trainer_clients',
  'access_tokens',
  'member_link_codes',
  'pt_requests',
  'ratings',
] as const;

/** What the member can download about themselves (their own rows, staff-internal notes excluded). */
const EXPORT_TABLES = [
  'memberships',
  'payments',
  'visits',
  'attendance',
  'bookings',
  'workout_plans',
  'nutrition_plans',
  'member_nutrition_plans',
  'member_consents',
  'loyalty_ledger',
  'promo_redemptions',
  'pt_requests',
  'trainer_appointments',
  'cafe_orders',
  'service_sales',
] as const;

/** Personal data on the account itself (F12-2), with or without a gym membership. */
const ACCOUNT_TABLES = [
  'workout_sessions',
  'body_measurements',
  'member_goals',
  'food_log_entries',
  'daily_checkins',
  'activities',
] as const;

async function rowsOf(tx: Tx, table: string, column: string, id: string) {
  const r = await sql<Record<string, unknown>>`
    select * from ${sql.table(`public.${table}`)} where ${sql.ref(column)} = ${id}`.execute(tx);
  return r.rows;
}

/** Removes the member's personal data and anonymizes the row. Returns files to delete. */
async function eraseMember(tx: Tx, member: { id: string; photo_path: string | null }) {
  const paths: string[] = [];
  for (const t of PERSONAL_TABLES)
    await sql`delete from ${sql.table(`public.${t}`)} where member_id = ${member.id}`.execute(tx);
  // Future group classes and appointments are cancelled; the history stays.
  await sql`
    update public.bookings b set status = 'cancelled', cancelled_at = now()
    from public.classes c
    where c.id = b.class_id and b.member_id = ${member.id}
      and b.status in ('confirmed', 'waitlisted') and c.starts_at > now()`.execute(tx);
  await sql`
    delete from public.trainer_appointments
    where member_id = ${member.id} and starts_at > now()`.execute(tx);
  if (member.photo_path) paths.push(member.photo_path);
  await tx
    .updateTable('members')
    .set({
      first_name: 'Obrisan',
      last_name: 'član',
      email: null,
      phone: null,
      date_of_birth: null,
      photo_path: null,
      notes_public: null,
      marketing_opt_in: false,
      user_id: null,
      deactivated_at: sql`coalesce(deactivated_at, now())`,
      anonymized_at: sql`now()`,
    })
    .where('id', '=', member.id)
    .execute();
  return paths;
}

/** Member row and member data of the caller in the transaction's gym. */
async function memberDataIn(tx: Tx, userId: string) {
  const member = await tx
    .selectFrom('members')
    .select([
      'id',
      'member_number',
      'first_name',
      'last_name',
      'email',
      'phone',
      'date_of_birth',
      'marketing_opt_in',
      'created_at',
    ])
    .where('user_id', '=', userId)
    .executeTakeFirst();
  const data: Record<string, unknown> = {};
  if (member) for (const t of EXPORT_TABLES) data[t] = await rowsOf(tx, t, 'member_id', member.id);
  return { member: member ?? null, data };
}

interface Presence {
  club_id: string;
  club_name: string;
  member_id: string | null;
  is_staff: boolean;
}

/** Every gym where the account has a member row or a staff role (F12-6). */
const presenceOf = (db: Kysely<DB> | Tx, userId: string) =>
  sql<Presence>`select * from public.account_presence(${userId})`.execute(db).then((r) => r.rows);

/** Runs `fn` as if the request were made in another gym. */
const inClub = <T>(clubId: string, fn: () => Promise<T>) => clubContext.run({ clubId }, fn);

export function createAccountService(db: Kysely<DB>) {
  return {
    /** Everything stored about the caller, as one JSON document (ZZPL / GDPR data portability). */
    exportData: (actor: Actor) =>
      withStaffTx(db, async (tx) => {
        const profile = await tx
          .selectFrom('profiles')
          .select(['id', 'first_name', 'last_name', 'phone', 'locale', 'created_at'])
          .where('id', '=', actor.userId)
          .executeTakeFirst();
        const email = await sql<{ email: string | null }>`
          select public.account_email(${actor.userId}) as email`
          .execute(tx)
          .then((r) => r.rows[0]?.email ?? null)
          .catch(() => null);
        const current = await memberDataIn(tx, actor.userId);
        const data: Record<string, unknown> = { ...current.data };
        for (const t of ACCOUNT_TABLES) data[t] = await rowsOf(tx, t, 'user_id', actor.userId);
        const sessions = (data.workout_sessions as Array<{ id: string }>).map((s) => s.id);
        data.workout_sets = sessions.length
          ? (
              await sql<Record<string, unknown>>`
                select * from public.workout_sets where session_id = any(${sessions}::uuid[])`.execute(
                tx,
              )
            ).rows
          : [];
        data.notifications = await rowsOf(tx, 'notifications', 'user_id', actor.userId);
        data.notification_preferences = await rowsOf(
          tx,
          'notification_preferences',
          'user_id',
          actor.userId,
        );
        return {
          exportedAt: new Date().toISOString(),
          account: profile ? { ...profile, email } : null,
          member: current.member,
          data,
        };
      }).then(async (doc) => {
        // F12-6: the same member data from every other gym the person belongs to.
        const here = currentClubId();
        const otherGyms = [];
        for (const p of await presenceOf(db, actor.userId)) {
          if (p.club_id === here || !p.member_id) continue;
          const part = await inClub(p.club_id, () =>
            withStaffTx(db, (tx) => memberDataIn(tx, actor.userId)),
          );
          otherGyms.push({ gym: { id: p.club_id, name: p.club_name }, ...part });
        }
        return { ...doc, otherGyms };
      }),

    /**
     * Deletes the caller's account: personal data is removed, the member row is anonymized
     * (bookkeeping records stay attached to it), then the login account is deleted.
     */
    deleteAccount: async (
      actor: Actor,
      req: Request,
      deps: { media: MediaStore; authAdmin?: AuthAdmin },
    ) => {
      // Staff of any gym keep their account (an owner must hand the gym over first).
      const presence = await presenceOf(db, actor.userId);
      if (actor.roles.length > 0 || presence.some((p) => p.is_staff))
        throw new AppError('BUSINESS_RULE', 'errors.account.staff_cannot_delete');
      if (!deps.authAdmin) throw new AppError('BUSINESS_RULE', 'errors.account.delete_failed');
      const files: string[] = [];
      // F12-6: the member row is anonymized in every gym, each with its own audit record.
      const here = currentClubId();
      const clubs = [...new Set([here, ...presence.map((p) => p.club_id)])].filter(
        (c): c is string => Boolean(c),
      );
      for (const clubId of clubs) {
        const paths = await inClub(clubId, () =>
          withStaffTx(db, async (tx) => {
            const members = await tx
              .selectFrom('members')
              .select(['id', 'photo_path'])
              .where('user_id', '=', actor.userId)
              .execute();
            const out: string[] = [];
            for (const m of members) out.push(...(await eraseMember(tx, m)));
            if (clubId === here) {
              const profile = await tx
                .selectFrom('profiles')
                .select('avatar_path')
                .where('id', '=', actor.userId)
                .executeTakeFirst();
              if (profile?.avatar_path) out.push(profile.avatar_path);
            }
            if (clubId === here || members.length > 0)
              await writeAudit(tx, actor, req, {
                action: 'account.delete',
                entityType: 'member',
                entityId: members[0]?.id ?? null,
                diff: { after: { anonymized: members.length > 0 } },
              });
            return out;
          }),
        );
        files.push(...paths);
      }
      // Login account last: the profile goes with it (notifications, push tokens cascade).
      await deps.authAdmin.deleteUser(actor.userId);
      for (const p of files) await deps.media.remove(p).catch(() => undefined);
    },

    /**
     * The same erasure done by staff, for a member who asks in person (or has no app account).
     * A linked app account is deleted too; staff accounts are never erased this way.
     */
    eraseByStaff: async (
      actor: Actor,
      req: Request,
      memberId: string,
      reason: string,
      deps: { media: MediaStore; authAdmin?: AuthAdmin },
    ) => {
      const { userId, files } = await withStaffTx(db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select(['id', 'photo_path', 'user_id', 'anonymized_at'])
          .where('id', '=', memberId)
          .forUpdate()
          .executeTakeFirst();
        if (!member) throw notFound('member');
        if (member.anonymized_at)
          throw new AppError('CONFLICT', 'errors.member.already_anonymized');
        // F12-6: the app account goes too only when the person has no other gym on the platform;
        // otherwise this gym's row is anonymized and unlinked and the account stays.
        let deleteAccount = false;
        if (member.user_id) {
          const presence = await presenceOf(tx, member.user_id);
          const here = presence.find((p) => p.club_id === currentClubId());
          if (here?.is_staff)
            throw new AppError('BUSINESS_RULE', 'errors.account.staff_cannot_delete');
          deleteAccount = !presence.some((p) => p.member_id !== member.id || p.is_staff);
          if (deleteAccount && !deps.authAdmin)
            throw new AppError('BUSINESS_RULE', 'errors.account.delete_failed');
        }
        const paths = await eraseMember(tx, member);
        if (deleteAccount) {
          const profile = await tx
            .selectFrom('profiles')
            .select('avatar_path')
            .where('id', '=', member.user_id!)
            .executeTakeFirst();
          if (profile?.avatar_path) paths.push(profile.avatar_path);
        }
        await writeAudit(tx, actor, req, {
          action: 'member.anonymize',
          entityType: 'member',
          entityId: member.id,
          diff: { after: { reason, appAccountDeleted: deleteAccount } },
        });
        return { userId: deleteAccount ? member.user_id : null, files: paths };
      });
      if (userId) await deps.authAdmin!.deleteUser(userId);
      for (const p of files) await deps.media.remove(p).catch(() => undefined);
    },
  };
}
