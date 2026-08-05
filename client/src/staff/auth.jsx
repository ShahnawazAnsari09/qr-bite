import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Loading } from '../components/ui.jsx';
import { ApiError, staffApi } from '../lib/api.js';
import { KEYS, store } from '../lib/format.js';

/**
 * Staff session state.
 *
 * The JWT lives in localStorage so a refresh does not log the floor staff out
 * mid-service. On boot it is re-verified against /auth/me rather than trusted —
 * that is what catches a token whose account an admin has since deactivated.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => store.get(KEYS.staffSession));
  const [checking, setChecking] = useState(Boolean(session?.token));

  const signOut = useCallback(() => {
    store.remove(KEYS.staffSession);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setChecking(false);
      return;
    }

    let active = true;
    staffApi
      .me(session.token)
      .then((data) => {
        if (!active) return;
        const refreshed = { ...session, user: data.user, restaurant: data.restaurant };
        store.set(KEYS.staffSession, refreshed);
        setSession(refreshed);
      })
      .catch((err) => {
        if (!active) return;
        // Only a rejected token ends the session; a network blip must not.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) signOut();
      })
      .finally(() => active && setChecking(false));

    return () => {
      active = false;
    };
    // Runs once per token: re-running on every session object change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, signOut]);

  const signIn = useCallback(async (username, password) => {
    const data = await staffApi.login(username, password);
    const next = { token: data.token, user: data.user, restaurant: data.restaurant };
    store.set(KEYS.staffSession, next);
    setSession(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      session,
      token: session?.token || null,
      user: session?.user || null,
      restaurant: session?.restaurant || null,
      isAdmin: session?.user?.role === 'admin',
      currency: session?.restaurant?.currencySymbol || '₹',
      checking,
      signIn,
      signOut,
    }),
    [session, checking, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

/** Route guard: sends unauthenticated staff to the login screen. */
export function RequireStaff({ children }) {
  const { token, checking } = useAuth();
  const location = useLocation();

  if (checking) return <Loading label="Restoring your session…" />;
  if (!token) return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;

  return children;
}

/**
 * Wraps a staff API call so an expired token ends the session instead of
 * leaving the page stuck on an error the user cannot act on.
 */
export function useApiCall() {
  const { token, signOut } = useAuth();

  return useCallback(
    async (fn) => {
      try {
        return await fn(token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) signOut();
        throw err;
      }
    },
    [token, signOut]
  );
}
