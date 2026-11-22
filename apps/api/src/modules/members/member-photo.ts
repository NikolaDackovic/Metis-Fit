import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import { withStaffTx } from '../../database/tx';
import type { MediaStore } from '../../shared/media';

/**
 * The face the front desk sees: the photo the gym took, else the member's own app profile photo
 * (the account is the source of the person's data in every gym).
 */
export async function memberPhotoUrl(
  db: Kysely<DB>,
  media: MediaStore,
  memberId: string,
): Promise<string | null> {
  const key = await withStaffTx(db, (tx) =>
    sql<{ k: string | null }>`
      select coalesce(m.photo_path, p.avatar_path) as k
      from public.members m left join public.profiles p on p.id = m.user_id
      where m.id = ${memberId}`
      .execute(tx)
      .then((r) => r.rows[0]?.k ?? null),
  );
  return key ? media.url(key) : null;
}

/** Adds `photoUrl` to the member of an access result. */
export async function withMemberPhoto<T extends { member: { id: string } | null }>(
  db: Kysely<DB>,
  media: MediaStore,
  result: T,
): Promise<T> {
  if (!result.member) return result;
  return {
    ...result,
    member: { ...result.member, photoUrl: await memberPhotoUrl(db, media, result.member.id) },
  };
}
