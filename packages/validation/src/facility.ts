import { z } from 'zod';
import { isoDate, pagination, uuid } from './common';

export const ROOM_TYPES = [
  'entrance',
  'cafe',
  'garden',
  'reception',
  'lockers',
  'changing_room',
  'toilet',
  'stairs',
  'gym',
  'crossfit',
  'boxing',
  'pool',
  'studio',
  'corridor',
  'other',
] as const;
export const roomType = z.enum(ROOM_TYPES);

export const EQUIPMENT_STATUSES = ['available', 'maintenance', 'out_of_service'] as const;
export const equipmentStatus = z.enum(EQUIPMENT_STATUSES);
export type EquipmentStatus = z.infer<typeof equipmentStatus>;

const key = z
  .string()
  .trim()
  .regex(/^[a-z0-9_-]{1,40}$/, { error: 'validation.invalid_key' });
const name = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(80, { error: 'validation.too_long' });
const optText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );
const coord = z.number().min(0).max(1000);

/** Names per language: Serbian required, English/Russian optional. */
const names = z.object({ sr: name, en: name.optional(), ru: name.optional() });

export const rectShape = z.object({
  type: z.literal('rect'),
  x: coord,
  y: coord,
  w: z.number().min(0.5).max(1000),
  h: z.number().min(0.5).max(1000),
});
export type RectShape = z.infer<typeof rectShape>;

export const mapRoomInput = z.object({
  key,
  type: roomType,
  shape: rectShape,
  names,
  descriptions: z
    .object({ sr: optText(2000), en: optText(2000), ru: optText(2000) })
    .partial()
    .default({}),
  isHidden: z.boolean().default(false),
  isUnavailable: z.boolean().default(false),
  unavailableNote: optText(200),
  placements: z
    .array(z.object({ equipmentId: uuid, x: coord, y: coord }))
    .max(200)
    .default([]),
});

/** How rooms are drawn over the floor: full fill, outline only, or only the name (the background shows the walls). */
export const ROOM_STYLES = ['filled', 'outline', 'labels'] as const;
export const roomStyle = z.enum(ROOM_STYLES);
export type RoomStyle = z.infer<typeof roomStyle>;

/** Storage key of an uploaded floor background (returned by POST /admin/map/background). */
export const mapBackgroundPath = z
  .string()
  .regex(/^(map|defaults)\/[a-zA-Z0-9_.-]{1,120}$/, { error: 'validation.invalid_image' });

export const mapFloorInput = z.object({
  key,
  level: z.number().int().min(-10).max(20),
  width: z.number().min(5).max(500),
  height: z.number().min(5).max(500),
  names,
  backgroundPath: mapBackgroundPath.nullable().default(null),
  backgroundOpacity: z.number().min(0.1).max(1).default(1),
  roomStyle: roomStyle.default('filled'),
  rooms: z.array(mapRoomInput).max(100),
});

export const mapBackgroundBody = z.object({
  image: z.string().min(16).max(1_500_000, { error: 'validation.image_too_large' }),
});
export const mapBackgroundDto = z.object({ path: z.string(), url: z.string() });
export type MapBackgroundDto = z.infer<typeof mapBackgroundDto>;

export const mapVisibilityBody = z.object({ visible: z.boolean() }).strict();

/** Whole draft replaced at once (simple, atomic); `revision` prevents overwriting someone else's edit. */
export const saveMapDraftBody = z
  .object({
    revision: z.number().int().min(1),
    isSchematic: z.boolean(),
    floors: z.array(mapFloorInput).min(1).max(10),
  })
  .strict()
  .superRefine((v, ctx) => {
    const floorKeys = new Set<string>();
    v.floors.forEach((f, fi) => {
      if (floorKeys.has(f.key))
        ctx.addIssue({
          code: 'custom',
          message: 'validation.duplicate_key',
          path: ['floors', fi, 'key'],
        });
      floorKeys.add(f.key);
      const roomKeys = new Set<string>();
      f.rooms.forEach((r, ri) => {
        if (roomKeys.has(r.key))
          ctx.addIssue({
            code: 'custom',
            message: 'validation.duplicate_key',
            path: ['floors', fi, 'rooms', ri, 'key'],
          });
        roomKeys.add(r.key);
      });
    });
  });
export type SaveMapDraftBody = z.infer<typeof saveMapDraftBody>;
export type MapFloorInput = z.infer<typeof mapFloorInput>;

/** Map as returned to editors (draft) and to everyone (published, localized). */
export const mapDto = z.object({
  versionId: uuid,
  version: z.number(),
  revision: z.number(),
  isSchematic: z.boolean(),
  publishedAt: z.string().nullable(),
  /** False when the club switched the map off for members (admin editor only sees this). */
  visibleToMembers: z.boolean(),
  /** Draft only: saved changes members do not see yet (not published). */
  unpublishedChanges: z.boolean().optional(),
  floors: z.array(
    z.object({
      key: z.string(),
      level: z.number(),
      width: z.number(),
      height: z.number(),
      name: z.string(),
      names: z.record(z.string(), z.string()),
      backgroundPath: z.string().nullable(),
      backgroundUrl: z.string().nullable(),
      backgroundOpacity: z.number(),
      roomStyle,
      rooms: z.array(
        z.object({
          key: z.string(),
          type: roomType,
          shape: rectShape,
          name: z.string(),
          names: z.record(z.string(), z.string()),
          description: z.string().nullable(),
          descriptions: z.record(z.string(), z.string().nullable()),
          isHidden: z.boolean(),
          isUnavailable: z.boolean(),
          unavailableNote: z.string().nullable(),
          placements: z.array(
            z.object({
              equipmentId: uuid,
              x: z.number(),
              y: z.number(),
              name: z.string(),
              status: equipmentStatus,
              categoryKey: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type MapDto = z.infer<typeof mapDto>;

// ── Equipment ────────────────────────────────────────────────────────────────
const equipmentTexts = z.object({
  name,
  description: optText(2000),
  usageInstructions: optText(4000),
  safetyNotes: optText(2000),
});

const equipmentFields = z.object({
  categoryKey: key,
  manufacturer: optText(80),
  model: optText(80),
  serialNumber: optText(80),
  assetTag: optText(40),
  purchasedOn: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  status: equipmentStatus.default('available'),
  videoUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .url({ protocol: /^https$/, error: 'validation.invalid_url' })
      .nullable()
      .optional(),
  ),
  translations: z.object({
    sr: equipmentTexts,
    en: equipmentTexts.optional(),
    ru: equipmentTexts.optional(),
  }),
});
export const createEquipmentBody = equipmentFields.strict();
export const updateEquipmentBody = equipmentFields
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'validation.empty_update' });
export type CreateEquipmentBody = z.infer<typeof createEquipmentBody>;
export type UpdateEquipmentBody = z.infer<typeof updateEquipmentBody>;

export const listEquipmentQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  category: key.optional(),
  status: equipmentStatus.optional(),
  locale: z.string().optional(),
});

export const equipmentDto = z.object({
  id: uuid,
  categoryKey: z.string(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  usageInstructions: z.string().nullable(),
  safetyNotes: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  status: equipmentStatus,
  videoUrl: z.string().nullable(),
  /** Where it stands on the PUBLISHED map, if placed. */
  location: z
    .object({
      floorKey: z.string(),
      floorName: z.string(),
      roomKey: z.string(),
      roomName: z.string(),
    })
    .nullable(),
});
export type EquipmentDto = z.infer<typeof equipmentDto>;

/** Admin view: all languages + internal fields. */
export const equipmentAdminDto = equipmentDto.extend({
  serialNumber: z.string().nullable(),
  assetTag: z.string().nullable(),
  purchasedOn: z.string().nullable(),
  archivedAt: z.string().nullable(),
  translations: z.record(
    z.string(),
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      usageInstructions: z.string().nullable(),
      safetyNotes: z.string().nullable(),
    }),
  ),
  openRequests: z.number(),
});
export type EquipmentAdminDto = z.infer<typeof equipmentAdminDto>;

export const categoryDto = z.object({ key: z.string(), name: z.string() });

// ── Maintenance ──────────────────────────────────────────────────────────────
export const MAINTENANCE_STATUSES = ['open', 'in_progress', 'resolved', 'rejected'] as const;
export const MAINTENANCE_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

export const reportProblemBody = z
  .object({
    equipmentId: uuid.optional(),
    roomKey: key.optional(),
    description: z.string().trim().min(5, { error: 'validation.description_min' }).max(2000),
  })
  .strict()
  .refine((v) => v.equipmentId || v.roomKey, {
    error: 'validation.target_required',
    path: ['equipmentId'],
  });

export const updateMaintenanceBody = z
  .object({
    status: z.enum(MAINTENANCE_STATUSES).optional(),
    priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
    resolutionNote: optText(2000),
    /** Optionally change the machine's status in the same step (e.g. take it out of service). */
    equipmentStatus: equipmentStatus.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'validation.empty_update' });

export const listMaintenanceQuery = pagination.extend({
  status: z.enum(MAINTENANCE_STATUSES).optional(),
});

export const maintenanceDto = z.object({
  id: uuid,
  equipmentId: uuid.nullable(),
  equipmentName: z.string().nullable(),
  equipmentStatus: equipmentStatus.nullable(),
  roomKey: z.string().nullable(),
  description: z.string(),
  source: z.enum(['member', 'staff']),
  reportedByName: z.string().nullable(),
  status: z.enum(MAINTENANCE_STATUSES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type MaintenanceDto = z.infer<typeof maintenanceDto>;
