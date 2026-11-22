import { sql, type Selectable } from 'kysely';
import type { Members } from '@grit/database';
import type {
  CreateMemberBody,
  ListMembersQuery,
  MemberDto,
  MemberListItemDto,
  UpdateMemberBody,
} from '@grit/validation';
import type { Tx } from '../../database/tx';

type MemberRow = Selectable<Members>;

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

export function toMemberDto(row: MemberRow): MemberDto {
  return {
    id: row.id,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    notesPublic: row.notes_public,
    marketingOptIn: row.marketing_opt_in,
    hasAppAccount: row.user_id !== null,
    deactivatedAt: iso(row.deactivated_at),
    anonymizedAt: iso(row.anonymized_at),
    createdAt: iso(row.created_at)!,
  };
}

/** camelCase API fields → snake_case columns (only the fields present in the input). */
export function toMemberColumns(input: Partial<CreateMemberBody>) {
  const map = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    phone: 'phone',
    dateOfBirth: 'date_of_birth',
    notesPublic: 'notes_public',
    marketingOptIn: 'marketing_opt_in',
  } as const;
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = input[key as keyof CreateMemberBody];
    if (value !== undefined) out[column] = value;
  }
  return out as Partial<Pick<MemberRow, (typeof map)[keyof typeof map]>>;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** Serbian Latin letters to plain ones (same mapping as the SQL translate() in the search). */
const fold = (s: string) =>
  s.replace(/[čćžšđ]/g, (c) => ({ č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd' })[c] ?? c);

export const membersRepository = {
  async list(tx: Tx, q: ListMembersQuery): Promise<{ rows: MemberListItemDto[]; total: number }> {
    let base = tx
      .selectFrom('members as m')
      .innerJoin('member_current_status as cs', 'cs.member_id', 'm.id');
    if (!q.includeDeactivated) base = base.where('m.deactivated_at', 'is', null);
    if (q.status) base = base.where('cs.status', '=', q.status);
    if (q.q) {
      const term = `%${escapeLike(q.q.toLowerCase())}%`;
      // Names match with or without Serbian letters: "dackovic" finds "Dačković" and the other way.
      const plain = `%${escapeLike(fold(q.q.toLowerCase().trim().replace(/\s+/g, ' ')))}%`;
      const folded = (s: ReturnType<typeof sql>) => sql`translate(lower(${s}), 'čćžšđ', 'cczsd')`;
      const digits = q.q.replace(/\D/g, '');
      base = base.where((eb) =>
        eb.or([
          eb(folded(sql`m.first_name || ' ' || m.last_name`), 'like', plain),
          eb(folded(sql`m.last_name || ' ' || m.first_name`), 'like', plain),
          eb(sql`lower(m.email::text)`, 'like', term),
          eb(sql`lower(m.member_number)`, 'like', term),
          ...(digits.length >= 4 ? [eb('m.phone', 'like', `%${digits}%`)] : []),
        ]),
      );
    }

    const desc = q.sort.startsWith('-');
    const column = q.sort.replace('-', '') === 'lastName' ? 'm.last_name' : 'm.created_at';

    const [rows, count] = await Promise.all([
      base
        .leftJoin('membership_plan_translations as pt', (j) =>
          j.onRef('pt.plan_id', '=', 'cs.plan_id').on('pt.locale', '=', 'sr'),
        )
        .selectAll('m')
        .select([
          'cs.status as current_status',
          'cs.end_date as current_end_date',
          'pt.name as current_plan_name',
          (eb) =>
            eb
              .selectFrom('attendance_attempts as a')
              .select((e) => e.fn.max('a.occurred_at').as('v'))
              .whereRef('a.member_id', '=', 'm.id')
              .where('a.result', '=', 'granted')
              .as('last_visit_at'),
        ])
        .orderBy(column, desc ? 'desc' : 'asc')
        .orderBy('m.id')
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
    ]);
    return {
      rows: rows.map((r) => ({
        ...toMemberDto(r),
        currentStatus: (r.current_status ?? 'none') as MemberListItemDto['currentStatus'],
        currentPlanName: r.current_plan_name ?? null,
        currentEndDate: r.current_end_date ?? null,
        lastVisitAt: iso(r.last_visit_at as Date | null),
      })),
      total: Number(count.n),
    };
  },

  findById(tx: Tx, id: string, opts: { forUpdate?: boolean } = {}) {
    let query = tx.selectFrom('members').selectAll().where('id', '=', id);
    if (opts.forUpdate) query = query.forUpdate();
    return query.executeTakeFirst();
  },

  insert(tx: Tx, input: CreateMemberBody, createdBy: string) {
    return tx
      .insertInto('members')
      .values({
        ...(toMemberColumns(input) as { first_name: string; last_name: string }),
        created_by: createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(tx: Tx, id: string, input: UpdateMemberBody) {
    return tx
      .updateTable('members')
      .set(toMemberColumns(input))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  deactivate(tx: Tx, id: string) {
    return tx
      .updateTable('members')
      .set({ deactivated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
