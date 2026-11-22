import type { ApiResponse, ErrorCode } from '@grit/validation';
import { selectClub, selectedClub } from './club-select';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    /** translation key */
    message: string,
  ) {
    super(message);
  }
}

let tokenProvider: () => Promise<string | null> = async () => null;
let onUnauthenticated: () => void = () => {};

export function configureApi(opts: {
  getToken: () => Promise<string | null>;
  onUnauthenticated: () => void;
}) {
  tokenProvider = opts.getToken;
  onUnauthenticated = opts.onUnauthenticated;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
) {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  // Club content (plans, exercises, classes) is written in sr/en/ru only; for Arabic the
  // closest language is English, not the Serbian default. UI texts stay Arabic.
  if (url.searchParams.get('locale') === 'ar') url.searchParams.set('locale', 'en');
  const token = await tokenProvider();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...(selectedClub() && { 'x-club': selectedClub()! }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'INTERNAL', 'errors.network');
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError(res.status, 'INTERNAL', 'errors.internal');
  if (!json.success) {
    // An expired session or a deleted account both end the session cleanly.
    if (json.error.code === 'UNAUTHENTICATED' || json.message === 'errors.profile.not_found') {
      onUnauthenticated();
    }
    // The chosen gym no longer exists or is suspended: fall back to the default gym.
    if (json.message === 'errors.club.not_found' && selectedClub()) void selectClub(null);
    throw new ApiError(res.status, json.error.code, json.message);
  }
  return json;
}

export const api = {
  get: async <T>(path: string, query?: Record<string, string>) =>
    (await request<T>('GET', path, undefined, query)).data,
  /** Paginated list: items + meta (page, pageSize, total). */
  page: async <T>(path: string, query?: Record<string, string>) => {
    const r = await request<T>('GET', path, undefined, query);
    return { items: r.data, meta: r.meta! };
  },
  post: async <T>(path: string, body: unknown = {}) => (await request<T>('POST', path, body)).data,
  patch: async <T>(path: string, body: unknown) => (await request<T>('PATCH', path, body)).data,
  put: async <T>(path: string, body: unknown) => (await request<T>('PUT', path, body)).data,
  del: async <T>(path: string) => (await request<T>('DELETE', path)).data,
};
