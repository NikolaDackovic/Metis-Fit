import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { API_URL, ApiError, configureApi } from './api';

/**
 * Two interchangeable auth backends:
 *  - 'supabase' (staging/production): email + password, TOTP MFA for owner/manager.
 *  - 'dev' (local only): token from the API's DEV login for users created by `pnpm db:dev`.
 * Sessions live in sessionStorage - closing the tab ends the admin session (docs/SECURITY.md §2).
 */
export const AUTH_MODE: 'supabase' | 'dev' =
  import.meta.env.VITE_AUTH_MODE === 'dev' ? 'dev' : 'supabase';

let supabase: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!supabase) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required');
    supabase = createClient(url, key, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
    });
  }
  return supabase;
}

const DEV_TOKEN_KEY = 'grit.dev.token';
const safeSession = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  },
};

type Status = 'loading' | 'signedOut' | 'signedIn' | 'mfaRequired';

interface AuthState {
  status: Status;
  setStatus: (s: Status) => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  setStatus: (status) => set({ status }),
}));

export async function getAccessToken(): Promise<string | null> {
  if (AUTH_MODE === 'dev') return safeSession.get(DEV_TOKEN_KEY);
  const { data } = await sb().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function initAuth() {
  configureApi({
    getToken: getAccessToken,
    onAuthFailure: (code) => {
      if (code === 'MFA_REQUIRED') useAuth.getState().setStatus('mfaRequired');
      else void signOut();
    },
  });
  const token = await getAccessToken();
  useAuth.getState().setStatus(token ? 'signedIn' : 'signedOut');
  if (AUTH_MODE === 'supabase') {
    sb().auth.onAuthStateChange((_event, session) => {
      if (!session) useAuth.getState().setStatus('signedOut');
    });
  }
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(401, 'UNAUTHENTICATED', 'admin.login.invalid_credentials');
  const aal = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
  const needsMfa = aal.data?.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2';
  useAuth.getState().setStatus(needsMfa ? 'mfaRequired' : 'signedIn');
}

export async function devSignIn(email: string) {
  const res = await fetch(`${API_URL}/dev/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = (await res.json().catch(() => null)) as { data?: { accessToken: string } } | null;
  if (!res.ok || !json?.data)
    throw new ApiError(res.status, 'UNAUTHENTICATED', 'admin.login.dev_failed');
  safeSession.set(DEV_TOKEN_KEY, json.data.accessToken);
  useAuth.getState().setStatus('signedIn');
}

/** TOTP: returns the QR code to enroll a new factor, or null if one already exists. */
export async function mfaEnrollIfNeeded(): Promise<{
  factorId: string;
  qrCode: string;
  secret: string;
} | null> {
  const { data } = await sb().auth.mfa.listFactors();
  const verified = data?.totp.find((f) => f.status === 'verified');
  if (verified) return null;
  const { data: enrolled, error } = await sb().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Metis Fit Admin',
  });
  if (error || !enrolled) throw new ApiError(400, 'BUSINESS_RULE', 'admin.mfa.enroll_failed');
  return { factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret };
}

export async function mfaVerify(code: string, factorId?: string) {
  let id = factorId;
  if (!id) {
    const { data } = await sb().auth.mfa.listFactors();
    id = data?.totp.find((f) => f.status === 'verified')?.id;
  }
  if (!id) throw new ApiError(400, 'BUSINESS_RULE', 'admin.mfa.no_factor');
  const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: id, code });
  if (error) throw new ApiError(400, 'BUSINESS_RULE', 'admin.mfa.invalid_code');
  useAuth.getState().setStatus('signedIn');
}

export async function signOut() {
  if (AUTH_MODE === 'dev') safeSession.set(DEV_TOKEN_KEY, null);
  else await sb().auth.signOut();
  useAuth.getState().setStatus('signedOut');
}
