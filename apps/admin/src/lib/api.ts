import type { ApiResponse, ErrorCode } from '@grit/validation';

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/v1';

/** F12: the gym this admin works in (see current-club.ts; read here directly to avoid a cycle). */
const CLUB_KEY = 'grit.admin.club';
function selectedClub(): string | null {
  try {
    return localStorage.getItem(CLUB_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    /** Translation key, e.g. errors.member.email_taken */
    message: string,
    readonly details: Array<{ path?: string; message?: string }> = [],
  ) {
    super(message);
  }
  /** Field errors keyed by path, values are translation keys. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]),
    );
  }
}

type TokenProvider = () => Promise<string | null>;
type AuthFailureHandler = (code: ErrorCode) => void;

let getToken: TokenProvider = async () => null;
let onAuthFailure: AuthFailureHandler = () => {};

export function configureApi(opts: { getToken: TokenProvider; onAuthFailure: AuthFailureHandler }) {
  getToken = opts.getToken;
  onAuthFailure = opts.onAuthFailure;
}

export interface Page<T> {
  items: T;
  meta: { page: number; pageSize: number; total: number };
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query; locale?: string } = {},
): Promise<{ data: T; meta?: Page<T>['meta'] }> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  // Club content has no Arabic yet: English is the closest language (not the Serbian default).
  if (url.searchParams.get('locale') === 'ar') url.searchParams.set('locale', 'en');
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(opts.body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        'accept-language': opts.locale ?? document.documentElement.lang ?? 'sr',
        ...(selectedClub() && { 'x-club': selectedClub()! }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'INTERNAL', 'errors.network');
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError(res.status, 'INTERNAL', 'errors.internal');
  if (!json.success) {
    const err = new ApiError(
      res.status,
      json.error.code,
      json.message,
      json.error.details as ApiError['details'],
    );
    if (err.code === 'UNAUTHENTICATED' || err.code === 'MFA_REQUIRED') onAuthFailure(err.code);
    // A deleted account behaves like an expired session.
    else if (err.message === 'errors.profile.not_found') onAuthFailure('UNAUTHENTICATED');
    // The selected gym no longer exists or was suspended: fall back to the default gym.
    else if (err.message === 'errors.club.not_found' && selectedClub()) {
      try {
        localStorage.removeItem(CLUB_KEY);
      } catch {
        /* ignore */
      }
      window.location.assign('/');
    }
    throw err;
  }
  return { data: json.data, meta: json.meta };
}

export const api = {
  get: async <T>(path: string, query?: Query) => (await request<T>('GET', path, { query })).data,
  page: async <T>(path: string, query?: Query): Promise<Page<T>> => {
    const r = await request<T>('GET', path, { query });
    return { items: r.data, meta: r.meta! };
  },
  post: async <T>(path: string, body?: unknown) =>
    (await request<T>('POST', path, { body: body ?? {} })).data,
  patch: async <T>(path: string, body: unknown) => (await request<T>('PATCH', path, { body })).data,
  put: async <T>(path: string, body: unknown) => (await request<T>('PUT', path, { body })).data,
  del: async <T>(path: string) => (await request<T>('DELETE', path)).data,
  raw: request,
};
