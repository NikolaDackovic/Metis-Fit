import { z } from 'zod';
import { uuid } from './common';

/** Staff accounts, roles / permissions and the trainers' appointments. */

const roleKey = z.string().regex(/^[a-z_]{2,40}$/, { error: 'validation.invalid_key' });

export const staffDto = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  roles: z.array(z.string()),
  deactivated: z.boolean(),
  trainerId: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffDto = z.infer<typeof staffDto>;

export const inviteStaffBody = z.object({
  email: z.email({ error: 'validation.invalid_email' }).transform((e) => e.toLowerCase()),
  firstName: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  lastName: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  roles: z.array(roleKey).min(1, { error: 'validation.required' }).max(10),
  /** Link the account to an existing trainer profile (schedule, earnings). */
  trainerId: uuid.nullable().optional(),
});
export type InviteStaffBody = z.infer<typeof inviteStaffBody>;
export const staffRolesBody = z.object({
  roles: z.array(roleKey).max(10),
  trainerId: uuid.nullable().optional(),
});
export const staffActiveBody = z.object({ active: z.boolean() });

export const permissionDto = z.object({ key: z.string(), description: z.string() });
export const roleDto = z.object({
  key: z.string(),
  name: z.string().nullable(),
  isSystem: z.boolean(),
  /** The owner role always has every permission. */
  locked: z.boolean(),
  permissions: z.array(z.string()),
  users: z.number(),
});
export type RoleDto = z.infer<typeof roleDto>;
export const rolesDto = z.object({ roles: z.array(roleDto), permissions: z.array(permissionDto) });
export type RolesDto = z.infer<typeof rolesDto>;
export const rolePermissionsBody = z.object({ permissions: z.array(z.string().max(60)).max(200) });
export const createRoleBody = z.object({
  key: roleKey,
  name: z.string().trim().min(1, { error: 'validation.required' }).max(60),
  copyFrom: roleKey.nullable().optional(),
});
export const roleParams = z.object({ key: roleKey });

// ── Appointments / schedule ───────────────────────────────────────────────────
export const APPOINTMENT_KINDS = ['pt', 'consultation', 'assessment', 'meeting', 'other'] as const;
export const APPOINTMENT_STATUSES = ['scheduled', 'done', 'cancelled', 'no_show'] as const;
export const appointmentBody = z.object({
  trainerId: uuid,
  memberId: uuid.nullable().optional(),
  kind: z.enum(APPOINTMENT_KINDS),
  title: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(120).nullable().optional(),
  ),
  startsAt: z.iso.datetime({ offset: true, error: 'validation.invalid_date' }),
  durationMin: z.number().int().min(10).max(720),
  location: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(80).nullable().optional(),
  ),
  note: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(500).nullable().optional(),
  ),
});
export type AppointmentBody = z.infer<typeof appointmentBody>;
export const appointmentStatusBody = z.object({ status: z.enum(APPOINTMENT_STATUSES) });

export const agendaItemDto = z.object({
  id: z.string(),
  type: z.enum(['class', 'appointment']),
  trainerId: z.string().nullable(),
  trainerName: z.string().nullable(),
  title: z.string(),
  kind: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.string().nullable(),
  memberId: z.string().nullable(),
  memberName: z.string().nullable(),
  /** Classes: confirmed bookings / capacity. */
  booked: z.number().nullable(),
  capacity: z.number().nullable(),
  status: z.string(),
  note: z.string().nullable(),
});
export type AgendaItemDto = z.infer<typeof agendaItemDto>;
export const agendaQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trainerId: uuid.optional(),
  locale: z.string().optional(),
});
export const myAppointmentDto = z.object({
  id: z.string(),
  kind: z.enum(APPOINTMENT_KINDS),
  title: z.string().nullable(),
  trainerName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.string().nullable(),
  status: z.enum(APPOINTMENT_STATUSES),
});
export type MyAppointmentDto = z.infer<typeof myAppointmentDto>;
