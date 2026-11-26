import { sql, type Kysely } from 'kysely';
import { supabaseServiceHeaders } from '../../shared/media';
import type { DB } from '@grit/database';
import { AppError } from '../../shared/errors';

/**
 * Creating staff accounts. Production: Supabase Auth invite (an email with a link to set the
 * password) using the service-role key, which lives only in the API's .env. Development and
 * tests: a local auth user is created directly (the dev database emulates `auth.users`).
 */
export interface AuthAdmin {
  /** Returns the auth user id (existing account with this email, or a newly invited one). */
  invite(email: string, meta: { first_name: string; last_name: string }): Promise<string>;
  /** Deletes the login account (and with it the profile). Used for account deletion. */
  deleteUser(userId: string): Promise<void>;
}

async function existing(db: Kysely<DB>, email: string) {
  const r = await sql<{
    id: string;
  }>`select id from auth.users where lower(email) = ${email.toLowerCase()} limit 1`
    .execute(db)
    .catch(() => ({ rows: [] as Array<{ id: string }> }));
  return r.rows[0]?.id ?? null;
}

export function createAuthAdmin(opts: {
  db: Kysely<DB>;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  allowLocal: boolean;
  redirectTo?: string;
}): AuthAdmin {
  return {
    async invite(email, meta) {
      const found = await existing(opts.db, email);
      if (found) return found;
      if (opts.supabaseUrl && opts.serviceRoleKey) {
        const res = await fetch(`${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1/invite`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...supabaseServiceHeaders(opts.serviceRoleKey),
          },
          body: JSON.stringify({
            email,
            data: meta,
            ...(opts.redirectTo && { redirect_to: opts.redirectTo }),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          id?: string;
          user?: { id?: string };
        };
        const id = json.id ?? json.user?.id;
        if (!res.ok || !id) throw new AppError('BUSINESS_RULE', 'errors.staff.invite_failed');
        return id;
      }
      if (!opts.allowLocal) throw new AppError('BUSINESS_RULE', 'errors.staff.invite_unavailable');
      const r = await sql<{ id: string }>`
        insert into auth.users (email, raw_user_meta_data) values (${email}, ${JSON.stringify(meta)}::jsonb)
        returning id`.execute(opts.db);
      return r.rows[0]!.id;
    },

    async deleteUser(userId) {
      if (opts.supabaseUrl && opts.serviceRoleKey) {
        const res = await fetch(
          `${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
          {
            method: 'DELETE',
            headers: supabaseServiceHeaders(opts.serviceRoleKey),
          },
        );
        if (!res.ok && res.status !== 404)
          throw new AppError('BUSINESS_RULE', 'errors.account.delete_failed');
        return;
      }
      if (!opts.allowLocal) throw new AppError('BUSINESS_RULE', 'errors.account.delete_failed');
      await sql`delete from auth.users where id = ${userId}`.execute(opts.db);
    },
  };
}
