import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, syncConfigured, siteUrl } from '../data/supabase.js';
import { adoptLocalData, resetSyncState, syncNow } from '../data/sync.js';
import { AUTH_PARAMS, isRecovery, parseAuthNotice } from '../domain/authNotice.js';

const AuthContext = createContext(null);

/** Remove auth parameters from the URL without adding a history entry. */
function scrubAuthParams() {
  const url = new URL(window.location.href);
  const hadHash = AUTH_PARAMS.some((k) => url.hash.includes(k + '='));
  let changed = false;
  for (const key of AUTH_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (hadHash) {
    url.hash = '';
    changed = true;
  }
  if (changed) window.history.replaceState({}, '', url.pathname + url.search);
}

/** Supabase enforces its own minimum; this is the friendlier front-line check. */
export function passwordProblem(password) {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (/^\d+$/.test(password)) return 'Digits alone are easy to guess — add letters.';
  if (/^(.)\1+$/.test(password)) return 'That is a single repeated character.';
  return null;
}

export function AuthProvider({ children, onSynced }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!syncConfigured);
  const [syncState, setSyncState] = useState({ status: 'idle', at: null, pending: 0, error: null });
  // Set when the user arrives via a password-reset link, so the UI can offer a
  // "choose a new password" form instead of dropping them on the dashboard.
  const [recovering, setRecovering] = useState(false);
  // A failed or successful email link leaves its outcome in the URL; surface it
  // instead of rendering as though nothing happened.
  const [notice, setNotice] = useState(() =>
    typeof window === 'undefined' ? null : parseAuthNotice(window.location.search, window.location.hash)
  );
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (!syncConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });

    // A recovery link may be consumed before the listener attaches, so also
    // read the token out of the URL. An errored link carries type=recovery too,
    // so isRecovery() excludes anything with an error attached.
    if (isRecovery(window.location.search, window.location.hash)) setRecovering(true);

    // Clear the auth parameters once read: they should not survive a refresh,
    // and access tokens have no business sitting in the address bar or in
    // browser history.
    scrubAuthParams();
    return () => sub.subscription.unsubscribe();
  }, []);

  const runSync = useCallback(async () => {
    if (!syncConfigured || !navigator.onLine) return;
    setSyncState((s) => ({ ...s, status: 'syncing', error: null }));
    try {
      const result = await syncNow();
      if (!result) return setSyncState({ status: 'idle', at: null, pending: 0, error: null });
      setSyncState({ status: 'ok', at: result.at, pending: result.pending, error: null });
      await onSyncedRef.current?.();
    } catch (err) {
      setSyncState((s) => ({ ...s, status: 'error', error: err.message }));
    }
  }, []);

  // Sync on sign-in, when the tab regains focus, when the network returns, and
  // every five minutes while the app is open.
  useEffect(() => {
    if (!user) return;
    runSync();
    const onVisible = () => document.visibilityState === 'visible' && runSync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', runSync);
    const id = setInterval(runSync, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', runSync);
      clearInterval(id);
    };
  }, [user, runSync]);

  const signUp = useCallback(async (email, password) => {
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // Whatever is already on this device belongs to the new account.
    await adoptLocalData();
    return {
      needsConfirmation: !data.session,
      message: data.session ? null : 'Check your email to confirm the account, then sign in.',
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    await adoptLocalData();
    await runSync();
    return {};
  }, [runSync]);

  const resetPassword = useCallback(async (email) => {
    // Reset links open in a real browser, so they must point at an https URL
    // Supabase allows. `app://taxhelper` is not one — see supabase.js.
    if (!siteUrl) {
      return {
        error:
          'Password reset has to be done on the website, not in the desktop app. ' +
          'Open the site in your browser and use "Forgot your password?" there, ' +
          'then sign in here with the new password.',
      };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/`,
    });
    return error
      ? { error: error.message }
      : {
          message:
            'Password reset email sent. The link expires in an hour and only works once — ' +
            'open it in the same browser if you can.',
        };
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  /** Completes a reset: called once the user is back with a recovery session. */
  const updatePassword = useCallback(async (password) => {
    const problem = passwordProblem(password);
    if (problem) return { error: problem };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    setRecovering(false);
    scrubAuthParams();
    return { message: 'Password updated. You are signed in.' };
  }, []);

  const signOut = useCallback(async () => {
    // Push anything still queued before the session goes away, or it is stranded
    // on this device until the next sign-in.
    await runSync().catch(() => {});
    await supabase.auth.signOut();
    await resetSyncState();
    setSyncState({ status: 'idle', at: null, pending: 0, error: null });
  }, [runSync]);

  const value = useMemo(
    () => ({
      user,
      ready,
      syncConfigured,
      syncState,
      recovering,
      notice,
      dismissNotice,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      runSync,
    }),
    [
      user, ready, syncState, recovering, notice, dismissNotice,
      signIn, signUp, signOut, resetPassword, updatePassword, runSync,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
