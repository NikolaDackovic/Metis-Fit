import { sql } from 'kysely';
import { z } from 'zod';
import {
  kioskFeedItemDto,
  kioskFeedQuery,
  kioskTokenDto,
  kioskTokenQuery,
  selfScanBody,
  accessResultDto,
  accessTokenDto,
  attendanceRowDto,
  listAttendanceQuery,
  manualCheckinBody,
  normalizeLocaleParam,
  overrideCheckinBody,
  validateAccessBody,
} from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createAccessService } from './access.service';
import { issueKioskToken } from './kiosk';
import { currentClubId } from '../../shared/club-context';
import { withMemberPhoto } from '../members/member-photo';

/** docs/SECURITY.md §6 */
export const tokenIssueLimiter = createAttemptLimiter({ max: 10, windowMs: 60_000 });
export const validateLimiter = createAttemptLimiter({ max: 60, windowMs: 60_000 });

const tags = ['Access'];
const localeOf = (header: string | undefined) => normalizeLocaleParam.parse(header?.slice(0, 2));

export const accessRoutes = [
  defineRoute({
    method: 'post',
    path: '/me/access-token',
    access: access.self,
    summary: 'Issue my short-lived, single-use QR access token (only if entry would be allowed)',
    tags,
    response: accessTokenDto,
    handler: async ({ actor, deps }) => {
      tokenIssueLimiter.hit(actor!.userId);
      const ttl = await sql<{
        v: number;
      }>`select public.setting_int('access.token_ttl_seconds', 60) as v`
        .execute(deps.db)
        .then((r) => r.rows[0]!.v);
      return {
        data: await createAccessService(deps.db, deps.accessTokenSecret).issue(actor!, ttl),
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/me/access-token/offline',
    access: access.self,
    summary:
      'Spare QR for entry without internet: valid a few hours (access.offline_pass_hours), single use; replaces the previous one',
    tags,
    response: accessTokenDto,
    handler: async ({ actor, deps }) => {
      tokenIssueLimiter.hit(actor!.userId);
      const hours = await sql<{
        v: number;
      }>`select public.setting_int('access.offline_pass_hours', 12) as v`
        .execute(deps.db)
        .then((r) => r.rows[0]!.v);
      return {
        data: await createAccessService(deps.db, deps.accessTokenSecret).issue(
          actor!,
          Math.min(Math.max(hours, 1), 48) * 3600,
          'offline',
        ),
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/access/validate',
    access: access.can('attendance.checkin'),
    summary: 'Validate a scanned QR token and record the check-in attempt',
    tags,
    body: validateAccessBody,
    response: accessResultDto,
    handler: async ({ body, actor, req, deps }) => {
      validateLimiter.hit(`${actor!.userId}:${body.terminalId}`);
      return {
        data: await withMemberPhoto(
          deps.db,
          deps.media,
          await createAccessService(deps.db, deps.accessTokenSecret).validate(
            actor!,
            body.token,
            body.terminalId,
            localeOf(req.get('accept-language')),
          ),
        ),
      };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/admin/access/kiosk-token',
    access: access.can('attendance.checkin'),
    summary: 'Door code for the entry screen (changes every few seconds, valid 30 s)',
    tags,
    query: kioskTokenQuery,
    response: kioskTokenDto,
    handler: async ({ query, deps, res }) => {
      res.setHeader('Cache-Control', 'no-store');
      return { data: issueKioskToken(deps.accessTokenSecret, currentClubId()!, query.terminalId) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/admin/access/kiosk-feed',
    access: access.can('attendance.checkin'),
    summary: 'Latest app scans at this door (first name and result), for the entry screen',
    tags,
    query: kioskFeedQuery,
    response: z.array(kioskFeedItemDto),
    handler: async ({ query, deps }) => ({
      data: await withStaffTx(deps.db, async (tx) => {
        const rows = await sql<{
          id: string;
          first_name: string | null;
          result: 'granted' | 'denied';
          reason_code: string;
          occurred_at: Date;
        }>`
          select a.id, m.first_name, a.result, a.reason_code, a.occurred_at
          from public.attendance_attempts a left join public.members m on m.id = a.member_id
          where a.source = 'self_scan' and a.terminal_id = ${query.terminalId}
            and a.occurred_at > ${query.since ?? new Date(Date.now() - 60_000).toISOString()}::timestamptz
          order by a.occurred_at desc limit 5`
          .execute(tx)
          .then((r) => r.rows);
        return rows.map((r) => ({
          id: r.id,
          firstName: r.first_name ?? '',
          result: r.result,
          reasonCode: r.reason_code,
          occurredAt: new Date(r.occurred_at).toISOString(),
        }));
      }),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/checkin',
    access: access.self,
    summary: "Enter by scanning the gym's door code with the app (same rules as at the desk)",
    tags,
    body: selfScanBody,
    response: accessResultDto,
    handler: async ({ body, actor, req, deps }) => {
      validateLimiter.hit(`self:${actor!.userId}`);
      return {
        data: await withMemberPhoto(
          deps.db,
          deps.media,
          await createAccessService(deps.db, deps.accessTokenSecret).selfScan(
            actor!,
            body.token,
            localeOf(req.get('accept-language')),
          ),
        ),
      };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/access/manual',
    access: access.can('attendance.checkin'),
    summary: 'Check a member in without QR (same rules as QR)',
    tags,
    body: manualCheckinBody,
    response: accessResultDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await withMemberPhoto(
        deps.db,
        deps.media,
        await createAccessService(deps.db, deps.accessTokenSecret).manual(
          actor!,
          body.memberId,
          body.terminalId,
          localeOf(req.get('accept-language')),
        ),
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/access/override',
    access: access.can('attendance.override'),
    summary: 'Grant entry despite a denial (reason required, audited, never consumes a visit)',
    tags,
    body: overrideCheckinBody,
    response: accessResultDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await withMemberPhoto(
        deps.db,
        deps.media,
        await createAccessService(deps.db, deps.accessTokenSecret).override(
          actor!,
          req,
          body.memberId,
          body.terminalId,
          body.reason,
          localeOf(req.get('accept-language')),
        ),
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/attendance',
    access: access.can('attendance.read'),
    summary: 'Check-in attempts (granted and denied) with filters',
    tags,
    query: listAttendanceQuery,
    response: z.array(attendanceRowDto),
    handler: async ({ query, deps }) => {
      const { items, total } = await withStaffTx(deps.db, async (tx) => {
        let base = tx
          .selectFrom('attendance_attempts as a')
          .leftJoin('members as m', 'm.id', 'a.member_id')
          .leftJoin('profiles as p', 'p.id', 'a.performed_by');
        const day = sql`(a.occurred_at at time zone 'Europe/Belgrade')::date`;
        if (query.from) base = base.where(day, '>=', sql`${query.from}::date`);
        if (query.to) base = base.where(day, '<=', sql`${query.to}::date`);
        if (query.result) base = base.where('a.result', '=', query.result);
        const [rows, count] = await Promise.all([
          base
            .select([
              'a.id',
              'a.occurred_at',
              'a.result',
              'a.reason_code',
              'a.source',
              'a.terminal_id',
              'a.member_id',
              'a.override_reason',
              'a.consumed_visit',
              'm.member_number',
              sql<string | null>`m.first_name || ' ' || m.last_name`.as('member_name'),
              sql<string | null>`nullif(trim(p.first_name || ' ' || p.last_name), '')`.as(
                'staff_name',
              ),
            ])
            .orderBy('a.occurred_at', 'desc')
            .limit(query.pageSize)
            .offset((query.page - 1) * query.pageSize)
            .execute(),
          base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
        ]);
        return {
          total: Number(count.n),
          items: rows.map((r) => ({
            id: r.id,
            occurredAt: new Date(r.occurred_at).toISOString(),
            result: r.result,
            reasonCode: r.reason_code,
            source: r.source,
            terminalId: r.terminal_id,
            memberId: r.member_id,
            memberName: r.member_name,
            memberNumber: r.member_number,
            performedByName: r.staff_name,
            overrideReason: r.override_reason,
            consumedVisit: r.consumed_visit,
          })),
        };
      });
      return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
    },
  }),
];
