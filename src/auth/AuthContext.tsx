import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/http';
import * as customerApi from '../api/customer/api';
import { session as customerSession } from '../api/customer/session';
import * as caregiverApi from '../api/caregiver/api';
import { session as caregiverSession } from '../api/caregiver/session';
import { decodeToken } from '../api/session';
import type { Me } from '../api/types';
import { clearQueries } from '../lib/query';
import { kv } from '../lib/storage';

export type AppRole = 'customer' | 'caregiver';

/** Where a signed-in caregiver belongs (web: features/caregiver/lib/auth.ts homeFor). */
export type CaregiverStage = 'onboarding' | 'pending' | 'approved';

const ROLE_KEY = 'caresaath.app.role';
/** Survives sign-out, so a returning user goes straight to their role's login. */
export const LAST_ROLE_KEY = 'caresaath.app.lastRole';

export function lastRole(): AppRole | null {
  const v = kv.getItem(LAST_ROLE_KEY);
  return v === 'customer' || v === 'caregiver' ? v : null;
}

interface AuthState {
  booting: boolean;
  /** Session exists but /me couldn't be reached (offline, timeout, 5xx). */
  bootError: unknown;
  retryBoot: () => void;
  role: AppRole | null;
  caregiverStage: CaregiverStage | null;
  me: Me | null;
  /**
   * Signs in and opens the app for the number's role. A new (CUSTOMER) number
   * with intent "caregiver" goes to caregiver onboarding instead. Returns an
   * error message to show, or null on success.
   */
  signIn: (phone: string, code: string, intent?: AppRole) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Re-read /me (after registering, or to check verification status). */
  reloadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const stageFor = (me: Me): CaregiverStage =>
  !me.caregiverProfile ? 'onboarding' : me.caregiverProfile.verificationStatus === 'APPROVED' ? 'approved' : 'pending';

export function AuthProvider({ children, messages }: { children: React.ReactNode; messages: { roleAdmin: string } }) {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<unknown>(null);
  const [bootTry, setBootTry] = useState(0);
  const [role, setRole] = useState<AppRole | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const clearAll = useCallback(() => {
    customerSession.clear();
    caregiverSession.clear();
    kv.removeItem(ROLE_KEY);
    clearQueries();
    setRole(null);
    setMe(null);
  }, []);

  // Restore the last session on launch.
  useEffect(() => {
    (async () => {
      const saved = kv.getItem(ROLE_KEY) as AppRole | null;
      setBootError(null);
      try {
        if (saved === 'customer' && customerSession.get()) {
          setMe(await customerApi.meApi.get());
          setRole('customer');
        } else if (saved === 'caregiver' && caregiverSession.get()) {
          setMe(await caregiverApi.meApi.get());
          setRole('caregiver');
        }
      } catch (e) {
        // Only an auth failure ends the session. Offline / timeout / server
        // errors keep it, so opening the app without signal doesn't log out.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clearAll();
        else setBootError(e);
      } finally {
        setBooting(false);
      }
    })();
  }, [clearAll, bootTry]);

  // A failed token refresh clears the session; follow it to the login screen.
  useEffect(() => {
    const store = role === 'customer' ? customerSession : role === 'caregiver' ? caregiverSession : null;
    if (!store) return;
    return store.subscribe(() => {
      if (!store.get()) {
        clearQueries();
        setRole(null);
        setMe(null);
      }
    });
  }, [role]);

  const signIn = useCallback(
    async (phone: string, code: string, intent?: AppRole): Promise<string | null> => {
      // One OTP endpoint for everyone; the token says who the number belongs to.
      const tokens = await customerApi.authApi.verifyOtp(phone, code);
      const claimed = decodeToken(tokens.accessToken)?.role;
      if (claimed === 'ADMIN') {
        // Admins use the web console: revoke and stay signed out.
        await customerApi.authApi.logout(tokens.refreshToken).catch(() => undefined);
        return messages.roleAdmin;
      }
      const r: AppRole = claimed === 'CAREGIVER' || intent === 'caregiver' ? 'caregiver' : 'customer';
      const api = r === 'customer' ? customerApi : caregiverApi;
      const store = r === 'customer' ? customerSession : caregiverSession;
      store.set({ ...tokens, phone });
      const profile = await api.meApi.get();
      kv.setItem(ROLE_KEY, r);
      kv.setItem(LAST_ROLE_KEY, r);
      setMe(profile);
      setRole(r);
      return null;
    },
    [messages],
  );

  const signOut = useCallback(async () => {
    const store = role === 'customer' ? customerSession : caregiverSession;
    const refresh = store.get()?.refreshToken;
    const api = role === 'customer' ? customerApi : caregiverApi;
    clearAll();
    if (refresh) await api.authApi.logout(refresh).catch(() => undefined);
  }, [role, clearAll]);

  const reloadMe = useCallback(async () => {
    if (role === 'caregiver') {
      // After /caregiver/register the access token still says CUSTOMER; refresh it first.
      const s = caregiverSession.get();
      if (s) {
        const tokens = await caregiverApi.authApi.refresh(s.refreshToken).catch(() => null);
        if (tokens) caregiverSession.set({ ...s, ...tokens });
      }
      setMe(await caregiverApi.meApi.get());
    } else if (role === 'customer') {
      setMe(await customerApi.meApi.get());
    }
  }, [role]);

  const value = useMemo<AuthState>(
    () => ({
      booting,
      bootError,
      retryBoot: () => {
        setBooting(true);
        setBootTry(n => n + 1);
      },
      role,
      me,
      caregiverStage: role === 'caregiver' && me ? stageFor(me) : null,
      signIn,
      signOut,
      reloadMe,
    }),
    [booting, bootError, role, me, signIn, signOut, reloadMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
