import { createHash, randomInt } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  idParams,
  linkAccountBody,
  linkCodeDto,
  membershipDto,
  myPaymentDto,
  myVisitDto,
  normalizeLocaleParam,
} from '@grit/validation';
import { withMemberTx, withStaffTx } from '../../database/tx';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { access, defineRoute } from '../../shared/route';
import { loadMemberships } from '../memberships/memberships.service';

const LINK_CODE_TTL_MINUTES = 15;
const hashCode = (code: string) => createHash('sha256').update(`grit-link:${code}`).digest('hex');

/** 5 attempts per 15 minutes per user, 20 per hour per IP (docs/SECURITY.md §6). */
export const linkUserLimiter = createAttemptLimiter({ max: 5, windowMs: 15 * 60_000 });
export const linkIpLimiter = createAttemptLimiter({ max: 20, windowMs: 60 * 60_000 });

const localeQuery = z.object({ locale: normalizeLocaleParam });

export const meMembershipRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/memberships',
    access: access.self,
    summary: 'My memberships with computed status (RLS-scoped)',
    tags: ['Me'],
    query: localeQuery,
    response: z.array(membershipDto),
    handler: async ({ actor, deps, query }) => ({
      data: await withMemberTx(deps.db, actor!, (tx) =>
        loadMemberships(tx, { locale: query.locale }),
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/payments',
    access: access.self,
    summary: 'My payments (no internal notes)',
    tags: ['Me'],
    query: localeQuery,
    response: z.array(myPaymentDto),
    handler: async ({ actor, deps, query }) => ({
      data: await withMemberTx(deps.db, actor!, async (tx) => {
        const rows = await tx
          .selectFrom('payments as p')
          .leftJoin('memberships as ms', 'ms.id', 'p.membership_id')
          .leftJoin('membership_plan_translations as t', (j) =>
            j.onRef('t.plan_id', '=', 'ms.plan_id').on('t.locale', '=', query.locale),
          )
          .leftJoin('membership_plan_translations as tsr', (j) =>
            j.onRef('tsr.plan_id', '=', 'ms.plan_id').on('tsr.locale', '=', 'sr'),
          )
          .select([
            'p.id',
            'p.amount',
            'p.currency',
            'p.method',
            'p.status',
            'p.paid_at',
            sql<string | null>`coalesce(t.name, tsr.name)`.as('plan_name'),
          ])
          .orderBy('p.paid_at', 'desc')
          .limit(100)
          .execute();
        return rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          method: r.method,
          status: r.status,
          paidAt: new Date(r.paid_at).toISOString(),
          planName: r.plan_name,
        }));
      }),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/visits',
    access: access.self,
    summary: 'My recent visits',
    tags: ['Me'],
    response: z.array(myVisitDto),
    handler: async ({ actor, deps }) => ({
      data: await withMemberTx(deps.db, actor!, async (tx) => {
        const rows = await tx
          .selectFrom('attendance_attempts')
          .select(['id', 'occurred_at'])
          .orderBy('occurred_at', 'desc')
          .limit(50)
          .execute();
        return rows.map((r) => ({ id: r.id, occurredAt: new Date(r.occurred_at).toISOString() }));
      }),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/link',
    access: access.self,
    summary: 'Link my app account to my member profile with a code from reception',
    tags: ['Me'],
    body: linkAccountBody,
    response: z.object({ memberId: z.string() }),
    handler: async ({ body, actor, req, deps }) => {
      linkUserLimiter.hit(actor!.userId);
      linkIpLimiter.hit(req.ip ?? 'unknown');
      const data = await withStaffTx(deps.db, async (tx) => {
        // Privileged connection: the member cannot read link codes or other members directly.
        const already = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor!.userId)
          .executeTakeFirst();
        if (already) throw new AppError('CONFLICT', 'errors.member.account_already_linked');

        const codeRow = await tx
          .selectFrom('member_link_codes')
          .select(['id', 'member_id'])
          .where('code_hash', '=', hashCode(body.code))
          .where('used_at', 'is', null)
          .where('expires_at', '>', new Date())
          .forUpdate()
          .executeTakeFirst();
        if (!codeRow) throw new AppError('BUSINESS_RULE', 'errors.member.invalid_link_code');

        const member = await tx
          .selectFrom('members')
          .select(['id', 'user_id', 'deactivated_at', 'first_name', 'last_name'])
          .where('id', '=', codeRow.member_id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        if (member.deactivated_at) throw new AppError('BUSINESS_RULE', 'errors.member.deactivated');
        if (member.user_id) throw new AppError('CONFLICT', 'errors.member.already_linked');

        await tx
          .updateTable('members')
          .set({ user_id: actor!.userId })
          .where('id', '=', member.id)
          .execute();
        await tx
          .updateTable('member_link_codes')
          .set({ used_at: new Date() })
          .where('id', '=', codeRow.id)
          .execute();
        // Fill an empty profile name from the member record (sign-up may not have collected it).
        await tx
          .updateTable('profiles')
          .set({ first_name: member.first_name, last_name: member.last_name })
          .where('id', '=', actor!.userId)
          .where('first_name', '=', '')
          .execute();
        await writeAudit(tx, actor!, req, {
          action: 'member.link',
          entityType: 'member',
          entityId: member.id,
          diff: { after: { userId: actor!.userId } },
        });
        return { memberId: member.id };
      });
      return { data };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/link-code',
    access: access.can('members.update'),
    summary: 'Issue a one-time 6-digit code (15 min) so the member can link the app',
    tags: ['Members'],
    params: idParams,
    response: linkCodeDto,
    handler: async ({ params, actor, req, deps }) => ({
      status: 201,
      data: await withStaffTx(deps.db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select(['id', 'user_id', 'deactivated_at'])
          .where('id', '=', params.id)
          .forUpdate()
          .executeTakeFirst();
        if (!member) throw notFound('member');
        if (member.deactivated_at) throw new AppError('BUSINESS_RULE', 'errors.member.deactivated');
        if (member.user_id) throw new AppError('CONFLICT', 'errors.member.already_linked');

        // Only one valid code per member: expire any previous unused code.
        await tx
          .updateTable('member_link_codes')
          .set({ expires_at: new Date() })
          .where('member_id', '=', member.id)
          .where('used_at', 'is', null)
          .where('expires_at', '>', new Date())
          .execute();

        // Avoid collisions with another member's still-valid code.
        let code = '';
        for (let i = 0; i < 5; i++) {
          code = String(randomInt(0, 1_000_000)).padStart(6, '0');
          const clash = await tx
            .selectFrom('member_link_codes')
            .select('id')
            .where('code_hash', '=', hashCode(code))
            .where('used_at', 'is', null)
            .where('expires_at', '>', new Date())
            .executeTakeFirst();
          if (!clash) break;
        }
        const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
        await tx
          .insertInto('member_link_codes')
          .values({
            member_id: member.id,
            code_hash: hashCode(code),
            expires_at: expiresAt,
            created_by: actor!.userId,
          })
          .execute();
        await writeAudit(tx, actor!, req, {
          action: 'member.link_code',
          entityType: 'member',
          entityId: member.id,
          diff: null, // the code itself is never logged
        });
        return { code, expiresAt: expiresAt.toISOString() };
      }),
    }),
  }),
];
