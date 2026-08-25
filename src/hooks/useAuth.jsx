import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, syncConfigured } from '../data/supabase.js';
import { adoptLocalData, resetSyncState, syncNow } from '../data/sync.js';

const AuthContext = createContext(null);

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
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (!syncConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return error ? { error: error.message } : { message: 'Password reset email sent.' };
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
    () => ({ user, ready, syncConfigured, syncState, signIn, signUp, signOut, resetPassword, runSync }),
    [user, ready, syncState, signIn, signUp, signOut, resetPassword, runSync]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
