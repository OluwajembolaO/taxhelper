import { createClient } from '@supabase/supabase-js';

// The anon key is PUBLIC by design — it ships inside the JS bundle and anyone
// can read it. It is not a secret and does not need to be hidden. What actually
// protects your data is Row Level Security in supabase/schema.sql.
//
// The SERVICE ROLE key is the opposite: it bypasses RLS entirely. It must never
// appear in this file, in any VITE_* variable, or anywhere in this repo.
// Trimmed: a trailing space or newline pasted into .env is otherwise truthy and
// produces an unhelpful "failed to fetch" instead of clean local-only mode.
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/** Sync is opt-in: with no env vars the app runs fully local, as before. */
export const syncConfigured = Boolean(url && anonKey);

// A service-role key in the browser bundle would expose every user's data, so
// refuse to start rather than run insecurely. The role is inside the JWT body.
function looksLikeServiceRole(token) {
  if (/service_role/i.test(token)) return true;
  try {
    const body = JSON.parse(atob(token.split('.')[1]));
    return body?.role === 'service_role';
  } catch {
    return false;
  }
}

if (anonKey && looksLikeServiceRole(anonKey)) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is a service-role key. That key bypasses all row-level ' +
      'security and must never reach the browser. Use the "anon public" key instead.'
  );
}

if (import.meta.env.DEV && url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
  console.warn(
    `[supabase] VITE_SUPABASE_URL looks wrong: "${url}". Expected something like ` +
      'https://abcdefgh.supabase.co (no trailing slash, no /rest/v1 path).'
  );
}

/**
 * The canonical https origin for auth redirects (password reset, email
 * confirmation).
 *
 * This CANNOT just be window.location.origin. In the desktop build the page is
 * served from `app://taxhelper`, which Supabase will not accept as a redirect
 * target — it silently falls back to the project's Site URL, which is why a
 * reset link from the desktop app lands on localhost:3000. Emails are opened in
 * a normal browser anyway, so the reset has to complete on the web app.
 *
 * Set VITE_SITE_URL to the deployed URL; it is baked in at build time.
 */
export const siteUrl = (() => {
  const configured = (import.meta.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return window.location.origin;
  }
  return ''; // desktop build with no VITE_SITE_URL — callers must handle this
})();

export const supabase = syncConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The session lives in localStorage because there is no server to set an
        // httpOnly cookie. See README § Security for what that does and does not
        // mean — in short, it is safe as long as no XSS runs on this origin,
        // which is what the CSP in vercel.json is there to guarantee.
        storageKey: 'taxhelper.auth',
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: { headers: { 'x-application-name': 'taxhelper' } },
    })
  : null;
