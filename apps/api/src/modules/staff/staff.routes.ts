import { z } from 'zod';
import {
  agendaItemDto,
  agendaQuery,
  appointmentBody,
  appointmentStatusBody,
  createRoleBody,
  idParams,
  inviteStaffBody,
  myAppointmentDto,
  normalizeLocaleParam,
  roleParams,
  rolePermissionsBody,
  rolesDto,
  staffActiveBody,
  staffDto,
  staffRolesBody,
} from '@grit/validation';
import type { AppDeps } from '../../app';
import { AppError } from '../../shared/errors';
import { access, defineRoute } from '../../shared/route';
import { withStaffTx } from '../../database/tx';
import { createAgendaService, trainerOf } from './agenda.service';
import { createStaffService } from './staff.service';

const ok = z.object({ ok: z.literal(true) });
const userParams = z.object({ userId: z.string().uuid() });
const staff = (deps: AppDeps) => {
  if (!deps.authAdmin) throw new AppError('BUSINESS_RULE', 'errors.staff.invite_unavailable');
  return createStaffService(deps.db, deps.authAdmin);
};

export const staffRoutes = [
  // ── Staff accounts ──────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/staff',
    access: access.can('staff.manage'),
    summary: 'Staff accounts with their roles',
    tags: ['Staff'],
    response: z.array(staffDto),
    handler: async ({ deps }) => ({ data: await staff(deps).list() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/staff',
    access: access.can('staff.manage'),
    summary: 'Add a staff member (invited by email; an existing account just gets the roles)',
    tags: ['Staff'],
    body: inviteStaffBody,
    response: staffDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await staff(deps).invite(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/staff/:userId',
    access: access.can('staff.manage'),
    summary:
      "Change a staff member's roles and trainer profile (not your own; owner only by an owner)",
    tags: ['Staff'],
    params: userParams,
    body: staffRolesBody,
    response: staffDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await staff(deps).update(actor!, req, params.userId, body.roles, body.trainerId),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/staff/:userId/active',
    access: access.can('staff.manage'),
    summary: 'Deactivate (access removed at once) or reactivate a staff account',
    tags: ['Staff'],
    params: userParams,
    body: staffActiveBody,
    response: staffDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await staff(deps).setActive(actor!, req, params.userId, body.active),
    }),
  }),

  // ── Roles and permissions ───────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/roles',
    access: access.can('staff.manage'),
    summary: 'Roles with their permissions, and every permission that exists',
    tags: ['Staff'],
    response: rolesDto,
    handler: async ({ deps }) => ({ data: await staff(deps).roles() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/roles',
    access: access.can('roles.manage'),
    summary: 'Create a custom role (optionally copying the permissions of another)',
    tags: ['Staff'],
    body: createRoleBody,
    response: ok,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await staff(deps).createRole(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/roles/:key/permissions',
    access: access.can('roles.manage'),
    summary: "Set a role's permissions (the owner role is locked)",
    tags: ['Staff'],
    params: roleParams,
    body: rolePermissionsBody,
    response: ok,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await staff(deps).setRolePermissions(actor!, req, params.key, body.permissions),
    }),
  }),
  defineRoute({
    method: 'delete',
    path: '/admin/roles/:key',
    access: access.can('roles.manage'),
    summary: 'Delete an unused custom role',
    tags: ['Staff'],
    params: roleParams,
    response: ok,
    handler: async ({ actor, req, params, deps }) => ({
      data: await staff(deps).deleteRole(actor!, req, params.key),
    }),
  }),

  // ── Schedule ────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/my-schedule',
    access: access.can('schedule.own'),
    summary: 'My schedule as a trainer: classes I lead and my appointments',
    tags: ['Schedule'],
    query: agendaQuery,
    response: z.array(agendaItemDto),
    handler: async ({ actor, query, deps }) => ({
      data: await createAgendaService(deps.db).agenda(
        actor!,
        query.from,
        query.to,
        normalizeLocaleParam.parse(query.locale),
        undefined,
        true,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/trainer-schedule',
    access: access.can('classes.roster'),
    summary: "Trainers' schedules (all, or one with ?trainerId)",
    tags: ['Schedule'],
    query: agendaQuery,
    response: z.array(agendaItemDto),
    handler: async ({ actor, query, deps }) => ({
      data: await createAgendaService(deps.db).agenda(
        actor!,
        query.from,
        query.to,
        normalizeLocaleParam.parse(query.locale),
        query.trainerId,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/appointments',
    access: access.can('schedule.own'),
    summary:
      "Add an appointment to a trainer's calendar (own calendar, or any with trainers.manage)",
    tags: ['Schedule'],
    body: appointmentBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createAgendaService(deps.db).create(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/appointments/:id/status',
    access: access.can('schedule.own'),
    summary: 'Mark an appointment done, no-show or cancelled',
    tags: ['Schedule'],
    params: idParams,
    body: appointmentStatusBody,
    response: ok,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createAgendaService(deps.db).setStatus(actor!, req, params.id, body.status),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/me/trainer',
    access: access.can('schedule.own'),
    summary: 'The trainer profile linked to my account (null when none)',
    tags: ['Schedule'],
    response: z.object({ trainerId: z.string().nullable() }),
    handler: async ({ actor, deps }) => ({
      data: { trainerId: await withStaffTx(deps.db, (tx) => trainerOf(tx, actor!.userId)) },
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/appointments',
    access: access.self,
    summary: 'My upcoming appointments with trainers',
    tags: ['Schedule'],
    response: z.array(myAppointmentDto),
    handler: async ({ actor, deps }) => ({ data: await createAgendaService(deps.db).mine(actor!) }),
  }),
];
