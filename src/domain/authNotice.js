// Turns the auth parameters Supabase appends to a redirect into something a
// person can act on.
//
// WHY: when a reset or confirmation link fails, Supabase sends the user back to
// the app with the reason in the URL and nothing else — e.g.
//   ?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
//   #error=access_denied&error_code=otp_expired&...
// Without this, the app renders as if nothing happened and the only explanation
// is raw query-string text most people will never read.
//
// Pure and DOM-free so it can be tested directly.

/** Codes worth explaining in our own words rather than Supabase's. */
const KNOWN = {
  otp_expired: {
    title: 'That link has expired',
    detail:
      'Password links last one hour and only work once. Some email apps also open links automatically to scan them, which uses the link up before you get there.',
    action: 'resend',
  },
  access_denied: {
    title: 'That link is no longer valid',
    detail: 'It may have already been used, or replaced by a newer one. Request a fresh link to continue.',
    action: 'resend',
  },
  server_error: {
    title: 'Something went wrong signing you in',
    detail: 'The login service returned an error. Trying again usually works.',
    action: 'retry',
  },
  validation_failed: {
    title: 'That link was malformed',
    detail: 'The link looks incomplete — email apps sometimes break long URLs across lines.',
    action: 'resend',
  },
  email_exists: {
    title: 'That email already has an account',
    detail: 'Sign in instead, or reset the password if you have forgotten it.',
    action: 'signin',
  },
  otp_disabled: {
    title: 'Email links are turned off',
    detail: 'Enable the email provider in your Supabase project under Authentication → Providers.',
    action: null,
  },
};

/** Supabase puts these in the query string, the hash fragment, or both. */
function collectParams(search, hash) {
  const out = {};
  for (const chunk of [search, hash]) {
    if (!chunk) continue;
    const params = new URLSearchParams(chunk.replace(/^[?#]/, ''));
    for (const [k, v] of params) if (v && !(k in out)) out[k] = v;
  }
  return out;
}

/** Sentence-case a raw description: "Email+link+is+invalid" -> readable text. */
function humanize(text) {
  if (!text) return '';
  const clean = text.replace(/\+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * @returns {null | {kind:'error'|'success', code:string, title:string, detail:string, action:string|null}}
 */
export function parseAuthNotice(search = '', hash = '') {
  const p = collectParams(search, hash);

  const code = p.error_code || p.error || null;
  if (code) {
    const known = KNOWN[code];
    return {
      kind: 'error',
      code,
      title: known?.title || 'That link did not work',
      // Prefer our wording, but never hide a message we have not seen before.
      detail: known?.detail || humanize(p.error_description) || 'The link could not be used.',
      action: known ? known.action : 'resend',
    };
  }

  // Successful email confirmation comes back with a type but no error.
  if (p.type === 'signup' || p.type === 'email_change') {
    return {
      kind: 'success',
      code: p.type,
      title: p.type === 'signup' ? 'Email confirmed' : 'Email address updated',
      detail: 'You can sign in now.',
      action: null,
    };
  }

  return null;
}

/** True when the URL carries a password-recovery token rather than an error. */
export function isRecovery(search = '', hash = '') {
  const p = collectParams(search, hash);
  return p.type === 'recovery' && !p.error && !p.error_code;
}

/** Auth params to strip once handled, so a refresh does not replay them. */
export const AUTH_PARAMS = [
  'error',
  'error_code',
  'error_description',
  'type',
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'sb',
];
