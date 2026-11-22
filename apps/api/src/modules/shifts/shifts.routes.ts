import { z } from 'zod';
import {
  absenceBody,
  absenceDto,
  clockStatusDto,
  closureBody,
  closureDto,
  idParams,
  isoDate,
  monthQuery,
  payRateBody,
  payrollDto,
  shiftPeopleDto,
  shiftRuleBody,
  shiftRuleDto,
  shiftTypeBody,
  shiftTypeDto,
  shiftWeekDto,
  timeEntriesQuery,
  timeEntryBody,
  timeEntryDto,
  uuid,
  shiftWeekQuery,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createShiftsService } from './shifts.service';

const TAG = ['Shifts'];
const svc = (deps: { db: Parameters<typeof createShiftsService>[0] }) =>
  createShiftsService(deps.db);
const ok = z.object({ ok: z.literal(true) });

export const shiftsRoutes = [
  // ── Weekly table ────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/shifts/week',
    access: access.can('shifts.view'),
    summary: 'Weekly shift table: days x shifts with the people working, absences, closed days',
    tags: TAG,
    query: shiftWeekQuery,
    response: shiftWeekDto,
    handler: async ({ query, deps }) => ({ data: await svc(deps).week(query.start) }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-shifts',
    access: access.can('shifts.own'),
    summary: 'My shifts this week (or the week of `start`)',
    tags: TAG,
    query: shiftWeekQuery,
    response: shiftWeekDto,
    handler: async ({ query, actor, deps }) => ({
      data: await svc(deps).myWeek(actor!.userId, query.start),
    }),
  }),

  // ── Shift types ─────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/shifts/types',
    access: access.can('shifts.own'),
    summary: 'Shifts the club defined (name, hours, color)',
    tags: TAG,
    response: z.array(shiftTypeDto),
    handler: async ({ deps }) => ({ data: await svc(deps).types() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/shifts/types',
    access: access.can('shifts.manage'),
    summary: 'Define a shift',
    tags: TAG,
    body: shiftTypeBody,
    response: shiftTypeDto,
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).saveType(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/shifts/types/:id',
    access: access.can('shifts.manage'),
    summary: 'Change a shift',
    tags: TAG,
    params: idParams,
    body: shiftTypeBody,
    response: shiftTypeDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await svc(deps).saveType(actor!, req, body, params.id),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/shifts/types/:id',
    access: access.can('shifts.manage'),
    summary: 'Delete a shift (and the schedule rules that use it)',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).deleteType(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),

  // ── Schedule rules ──────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/shifts/people',
    access: access.can('shifts.manage'),
    summary: 'Active staff who can be scheduled',
    tags: TAG,
    response: shiftPeopleDto,
    handler: async ({ deps }) => ({ data: await svc(deps).people() }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/shifts/rules',
    access: access.can('shifts.manage'),
    summary: 'Who works which shift on which weekdays, and from/until when',
    tags: TAG,
    response: z.array(shiftRuleDto),
    handler: async ({ deps }) => ({ data: await svc(deps).rules() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/shifts/rules',
    access: access.can('shifts.manage'),
    summary: 'Schedule one employee: one or more lines (shift + weekdays) for a period',
    tags: TAG,
    body: shiftRuleBody,
    response: z.object({ created: z.number() }),
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).addRules(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/shifts/rules/:id',
    access: access.can('shifts.manage'),
    summary: 'Remove a schedule rule',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).deleteRule(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),

  // ── Absences ────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/shifts/absences',
    access: access.can('shifts.manage'),
    summary: 'Absences (vacation, sick leave, days off, slava...) from 60 days ago',
    tags: TAG,
    query: z.object({ from: isoDate.optional() }),
    response: z.array(absenceDto),
    handler: async ({ query, deps }) => ({ data: await svc(deps).absences(query.from) }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/shifts/absences',
    access: access.can('shifts.manage'),
    summary: 'Record an absence; the person disappears from the table on those days',
    tags: TAG,
    body: absenceBody,
    response: z.object({ id: uuid }),
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).addAbsence(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/shifts/absences/:id',
    access: access.can('shifts.manage'),
    summary: 'Remove an absence',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).deleteAbsence(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),

  // ── Non-working days ────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/shifts/closures',
    access: access.can('shifts.manage'),
    summary: 'Holidays and days the club is closed',
    tags: TAG,
    response: z.array(closureDto),
    handler: async ({ deps }) => ({ data: await svc(deps).closures() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/shifts/closures',
    access: access.can('shifts.manage'),
    summary: 'Add or change a holiday / non-working day',
    tags: TAG,
    body: closureBody,
    response: z.object({ id: uuid }),
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).addClosure(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/shifts/closures/:id',
    access: access.can('shifts.manage'),
    summary: 'Remove a non-working day',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).deleteClosure(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),

  // ── Time clock ──────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/timeclock',
    access: access.can('shifts.own'),
    summary: 'Am I clocked in, and my hours this month',
    tags: TAG,
    response: clockStatusDto,
    handler: async ({ actor, deps }) => ({ data: await svc(deps).clockStatus(actor!.userId) }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/timeclock/in',
    access: access.can('shifts.own'),
    summary: 'Clock in (start of work)',
    tags: TAG,
    response: clockStatusDto,
    handler: async ({ actor, req, deps }) => {
      await svc(deps).clockIn(actor!, req);
      return { data: await svc(deps).clockStatus(actor!.userId) };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/timeclock/out',
    access: access.can('shifts.own'),
    summary: 'Clock out (end of work)',
    tags: TAG,
    response: clockStatusDto,
    handler: async ({ actor, req, deps }) => {
      await svc(deps).clockOut(actor!, req);
      return { data: await svc(deps).clockStatus(actor!.userId) };
    },
  }),

  // ── Payroll ─────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/payroll',
    access: access.can('payroll.read'),
    summary: 'Worked days and hours per person in a month, hourly rate and payout',
    tags: TAG,
    query: monthQuery,
    response: payrollDto,
    handler: async ({ query, deps }) => ({ data: await svc(deps).payroll(query.month) }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/payroll/entries',
    access: access.can('payroll.read'),
    summary: "One person's clock-in / clock-out entries in a month",
    tags: TAG,
    query: timeEntriesQuery,
    response: z.array(timeEntryDto),
    handler: async ({ query, deps }) => ({
      data: await svc(deps).entries(query.month, query.userId),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/payroll/entries',
    access: access.can('payroll.read'),
    summary: 'Add a work entry by hand (forgotten clock-in)',
    tags: TAG,
    body: timeEntryBody,
    response: timeEntryDto,
    handler: async ({ body, actor, req, deps }) => ({
      status: 201,
      data: await svc(deps).addEntry(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/payroll/entries/:id',
    access: access.can('payroll.read'),
    summary: 'Correct a work entry',
    tags: TAG,
    params: idParams,
    body: timeEntryBody,
    response: timeEntryDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await svc(deps).updateEntry(actor!, req, params.id, body),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/payroll/entries/:id',
    access: access.can('payroll.read'),
    summary: 'Delete a work entry',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, actor, req, deps }) => {
      await svc(deps).deleteEntry(actor!, req, params.id);
      return { data: { ok: true as const } };
    },
  }),
  defineRoute({
    method: 'put',
    path: '/admin/payroll/rates/:userId',
    access: access.can('payroll.read'),
    summary: "Set a person's hourly rate (in minor units, e.g. para)",
    tags: TAG,
    params: z.object({ userId: uuid }),
    body: payRateBody,
    response: z.object({ hourlyRateMinor: z.number() }),
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await svc(deps).setRate(actor!, req, params.userId, body.hourlyRateMinor),
    }),
  }),
];
