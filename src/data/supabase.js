import { createClient } from '@supabase/supabase-js';

// The anon key is PUBLIC by design — it ships inside the JS bundle and anyone
// can read it. It is not a secret and does not need to be hidden. What actually
// protects your data is Row Level Security in supabase/schema.sql.
//
// The SERVICE ROLE key is the opposite: it bypasses RLS entirely. It must never
// appear in this file, in any VITE_* variable, or anywhere in this repo.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Sync is opt-in: with no env vars the app runs fully local, as before. */
export const syncConfigured = Boolean(url && anonKey);

if (import.meta.env.DEV && url && /service_role/i.test(anonKey || '')) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY looks like a service-role key. That key bypasses all ' +
      'row-level security and must never be exposed to the browser. Use the anon key.'
  );
}

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
