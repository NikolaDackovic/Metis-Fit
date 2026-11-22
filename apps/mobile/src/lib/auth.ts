import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { API_URL, ApiError, configureApi } from './api';
import { secureStorage } from './storage';
import { clearOfflinePass } from './offline-pass';
import { unregisterPush } from './push';
import { useWorkout } from './workout-store';

/**
 * 'supabase' for real builds; 'dev' only for local development against `pnpm db:dev`
 * (the API refuses DEV login outside NODE_ENV=development).
 */
export const AUTH_MODE: 'supabase' | 'dev' =
  process.env.EXPO_PUBLIC_AUTH_MODE === 'dev' ? 'dev' : 'supabase';

const DEV_TOKEN = 'grit.dev.token';

let supabase: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!supabase) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required');
    supabase = createClient(url, key, {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return supabase;
}

type Status = 'loading' | 'signedOut' | 'signedIn';
export const useAuth = create<{ status: Status; set: (s: Status) => void }>((set) => ({
  status: 'loading',
  set: (status) => set({ status }),
}));

export async function getAccessToken(): Promise<string | null> {
  if (AUTH_MODE === 'dev') return secureStorage.getItem(DEV_TOKEN);
  const { data } = await sb().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function initAuth() {
  configureApi({ getToken: getAccessToken, onUnauthenticated: () => void signOut() });
  const token = await getAccessToken();
  useAuth.getState().set(token ? 'signedIn' : 'signedOut');
  if (AUTH_MODE === 'supabase') {
    sb().auth.onAuthStateChange((_e, session) =>
      useAuth.getState().set(session ? 'signedIn' : 'signedOut'),
    );
  }
}

export async function signIn(email: string, password: string) {
  if (AUTH_MODE === 'dev') {
    const res = await fetch(`${API_URL}/dev/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { data?: { accessToken: string } } | null;
    if (!res?.ok || !json?.data)
      throw new ApiError(401, 'UNAUTHENTICATED', 'app.auth.invalid_credentials');
    await secureStorage.setItem(DEV_TOKEN, json.data.accessToken);
  } else {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, 'UNAUTHENTICATED', 'app.auth.invalid_credentials');
  }
  useAuth.getState().set('signedIn');
}

/** Member details collected at sign-up; turned into a member profile after the first sign-in. */
export const PENDING_JOIN = 'grit.pending_join';
export type JoinDetails = { phone: string | null; dateOfBirth: string | null };

/**
 * Sign-up. DEV: creates the local account and signs in at once (returns 'signedIn').
 * Supabase: sends the confirmation email (returns 'confirm'). With `join` the person also
 * becomes a member (new to the club); without it they link an existing membership by code.
 */
export async function signUp(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale: string;
  join: JoinDetails | null;
}): Promise<'signedIn' | 'confirm'> {
  if (input.join) await secureStorage.setItem(PENDING_JOIN, JSON.stringify(input.join));
  if (AUTH_MODE === 'dev') {
    const res = await fetch(`${API_URL}/dev/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as {
      data?: { accessToken: string };
      message?: string;
    } | null;
    if (!res?.ok || !json?.data)
      throw new ApiError(
        res?.status ?? 0,
        'BUSINESS_RULE',
        json?.message ?? 'app.auth.signup_failed',
      );
    await secureStorage.setItem(DEV_TOKEN, json.data.accessToken);
    useAuth.getState().set('signedIn');
    return 'signedIn';
  }
  const { error } = await sb().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { first_name: input.firstName, last_name: input.lastName, locale: input.locale },
    },
  });
  if (error) throw new ApiError(400, 'BUSINESS_RULE', 'app.auth.signup_failed');
  return 'confirm';
}

export async function requestPasswordReset(email: string) {
  if (AUTH_MODE === 'dev')
    throw new ApiError(400, 'BUSINESS_RULE', 'app.auth.signup_unavailable_dev');
  await sb().auth.resetPasswordForEmail(email);
}

export async function signOut() {
  // Last chance to upload unsynced workouts, then wipe them: the next account on this device
  // must never see them.
  const workouts = useWorkout.getState();
  if (useAuth.getState().status === 'signedIn') await workouts.sync().catch(() => undefined);
  workouts.reset();
  await unregisterPush();
  await clearOfflinePass();
  if (AUTH_MODE === 'dev') await secureStorage.removeItem(DEV_TOKEN);
  else await sb().auth.signOut();
  useAuth.getState().set('signedOut');
}
