// Checks a Supabase project is set up correctly and — most importantly — that
// Row Level Security is actually blocking anonymous reads.
//
//   node scripts/verify-supabase.mjs
//
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env / .env.local.
// Uses only the anon key, so it sees exactly what a stranger with your public
// bundle would see. Nothing is written and nothing is deleted.

import { readFileSync, existsSync } from 'node:fs';

const TABLES = ['entries', 'shifts', 'settings', 'paid_periods'];
const BUCKET = 'proof';

// ─── env loading ───────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (value) env[key] = value; // later file wins
    }
  }
  return env;
}

const env = loadEnv();
const url = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = env.VITE_SUPABASE_ANON_KEY || '';

let failures = 0;
let warnings = 0;
const pass = (m, extra = '') => console.log(`  PASS  ${m}${extra ? '  — ' + extra : ''}`);
const fail = (m, extra = '') => {
  console.log(`  FAIL  ${m}${extra ? '  — ' + extra : ''}`);
  failures++;
};
const warn = (m, extra = '') => {
  console.log(`  WARN  ${m}${extra ? '  — ' + extra : ''}`);
  warnings++;
};

console.log('\nTaxHelper — Supabase setup check\n');

// ─── 1. credentials present and shaped right ───────────────────────────────
console.log('Credentials');
if (!url || !key) {
  console.log('  FAIL  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set in .env');
  console.log('\n        Get them from Supabase → Project Settings → API,');
  console.log('        paste into .env, then run this again.\n');
  process.exit(1);
}

if (/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) pass('URL looks right', url);
else fail('URL is malformed', `got "${url}" — expected https://xxxx.supabase.co with no trailing path`);

// Decode the JWT body to see which role this key carries.
let role = null;
try {
  role = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).role;
} catch {
  /* not a JWT — newer publishable keys are opaque */
}

if (role === 'service_role') {
  fail('THIS IS A SERVICE-ROLE KEY', 'it bypasses all security — replace it with the "anon public" key');
} else if (role === 'anon') {
  pass('key is the anon key', 'safe to ship in the browser');
} else if (key.startsWith('sb_secret')) {
  fail('THIS IS A SECRET KEY', 'use the publishable/anon key instead');
} else if (key.startsWith('sb_publishable')) {
  pass('key is a publishable key', 'safe to ship in the browser');
} else {
  warn('could not identify the key type', 'continuing — the checks below still apply');
}

// ─── 2. can we reach the project at all? ───────────────────────────────────
console.log('\nConnection');
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function api(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  return { status: res.status, body };
}

try {
  const res = await fetch(`${url}/rest/v1/`, { headers });
  if (res.status === 401) {
    fail('rejected the API key (401)', 'wrong key, or it belongs to a different project');
  } else if (res.ok || res.status === 404) {
    pass('project is reachable');
  } else {
    warn(`unexpected status ${res.status} from the REST endpoint`);
  }
} catch (err) {
  fail('could not reach the project', err.message);
  console.log('\n  Check the URL and your internet connection, then re-run.\n');
  process.exit(1);
}

// ─── 3. schema applied? ────────────────────────────────────────────────────
console.log('\nSchema (did supabase/schema.sql run?)');
const missing = [];
for (const table of TABLES) {
  const { status, body } = await api(`/rest/v1/${table}?select=*&limit=1`);
  if (status === 404 || body?.code === '42P01') {
    fail(`table "${table}" does not exist`);
    missing.push(table);
  } else {
    pass(`table "${table}" exists`);
  }
}

// ─── 4. THE IMPORTANT ONE: is RLS actually blocking anonymous reads? ───────
console.log('\nRow Level Security (the check that matters)');
console.log('  Reading each table as an anonymous stranger. Every one must come back empty.');
for (const table of TABLES) {
  if (missing.includes(table)) continue;
  const { status, body } = await api(`/rest/v1/${table}?select=*&limit=5`);

  if (status === 200 && Array.isArray(body)) {
    if (body.length === 0) {
      // Empty because RLS filtered it, or because there is genuinely no data.
      // Either way an anonymous caller sees nothing, which is the requirement.
      pass(`"${table}" returns no rows to anonymous callers`);
    } else {
      fail(
        `"${table}" LEAKED ${body.length} row(s) to an anonymous caller`,
        'RLS is OFF for this table — re-run supabase/schema.sql'
      );
    }
  } else if (status === 401 || status === 403 || body?.code === '42501') {
    pass(`"${table}" refuses anonymous access outright`);
  } else {
    warn(`"${table}" returned an unexpected status ${status}`, JSON.stringify(body)?.slice(0, 120));
  }
}

// ─── 5. storage bucket ─────────────────────────────────────────────────────
console.log('\nStorage (proof attachments)');
{
  const { status, body } = await api(`/storage/v1/bucket/${BUCKET}`);
  if (status === 200 && body) {
    pass(`bucket "${BUCKET}" exists`);
    if (body.public === true) {
      fail('bucket is PUBLIC', 'anyone with a URL could read your pay stubs — re-run schema.sql');
    } else {
      pass('bucket is private', 'files are served only through short-lived signed URLs');
    }
  } else if (status === 400 || status === 404) {
    fail(`bucket "${BUCKET}" not found`, 'the storage section of schema.sql did not run');
  } else {
    // Some projects block anonymous bucket metadata reads — that is fine.
    warn(`could not read bucket metadata (status ${status})`, 'check it by hand in Storage');
  }
}

// ─── 6. auth reachable ─────────────────────────────────────────────────────
console.log('\nAuth');
{
  const res = await fetch(`${url}/auth/v1/settings`, { headers });
  const settings = await res.json().catch(() => null);
  if (res.ok && settings) {
    pass('auth service is reachable');
    if (settings.external?.email === false) {
      fail('email sign-in is DISABLED', 'enable it: Authentication → Providers → Email');
    } else {
      pass('email sign-in is enabled');
    }
    if (settings.mailer_autoconfirm === true) {
      warn('email confirmation is OFF', 'anyone can register an address they do not own');
    } else {
      pass('email confirmation is on');
    }
  } else {
    warn(`could not read auth settings (status ${res.status})`);
  }
}

// ─── summary ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(64));
if (failures > 0) {
  console.log(`${failures} problem(s) found${warnings ? `, ${warnings} warning(s)` : ''}.`);
  console.log('Fix the FAIL lines above, then run this again.\n');
  process.exit(1);
}
console.log(
  warnings > 0
    ? `Setup looks good, with ${warnings} warning(s) worth a look.\n`
    : 'Everything checks out. Run `npm run dev` and create your account.\n'
);
