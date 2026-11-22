export * from './access';
export * from './classes';
export * from './common';
export * from './facility';
export * from './members';
export * from './me';
export * from './memberships';
export * from './payments';
export * from './plans';
export * from './plans-nutrition';
export * from './visits';
export * from './workouts';
export * from './suggest';
export * from './notifications';
export * from './promos-loyalty';
export * from './club';
export * from './wellbeing';
export * from './cafe';
export * from './services';
export * from './staff';
export * from './join';
export * from './purchases';
export * from './reports';
export * from './shifts';
export * from './clubs';

/** Stable machine-readable API error codes (docs/API.md §1). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'MFA_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BUSINESS_RULE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: null;
  error: null;
  meta?: { page: number; pageSize: number; total: number };
}
export interface ApiFailure {
  success: false;
  data: null;
  message: string;
  error: { code: ErrorCode; details: unknown[] };
  requestId?: string;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export * from './occupancy';
export * from './pauses';
export * from './referrals';
export * from './challenges';
export * from './ratings';
export * from './messages';
export * from './availability';
export * from './calendar';
