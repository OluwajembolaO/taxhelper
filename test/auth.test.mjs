// Tests for the auth-link outcome parser — the thing that turns a raw
// error_code in the URL into something a person can act on.
// Run: node test/auth.test.mjs
import { parseAuthNotice, isRecovery, AUTH_PARAMS } from '../src/domain/authNotice.js';

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (cond ? '' : ' <- ' + extra));
  if (!cond) fails++;
};

// The exact URL that prompted this, params in BOTH query and hash.
const SEARCH =
  '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
const HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';

{
  const n = parseAuthNotice(SEARCH, HASH);
  ok('expired link produces a notice', n !== null);
  ok('classified as an error', n.kind === 'error', n.kind);
  ok('specific code wins over generic', n.code === 'otp_expired', n.code);
  ok('title is human', n.title === 'That link has expired', n.title);
  ok('explains single-use + scanners', /only work once/i.test(n.detail) && /scan/i.test(n.detail));
  ok('offers to resend', n.action === 'resend', n.action);
  ok('never leaks raw + separators', !n.title.includes('+') && !n.detail.includes('+'));
}

// Hash-only and query-only must behave identically — Supabase varies.
ok('hash-only is parsed', parseAuthNotice('', HASH)?.code === 'otp_expired');
ok('query-only is parsed', parseAuthNotice(SEARCH, '')?.code === 'otp_expired');

// An unknown code must still surface, using Supabase's own wording.
{
  const n = parseAuthNotice('?error_code=some_new_code&error_description=Totally+new+failure', '');
  ok('unknown code still shows', n !== null);
  ok('falls back to the raw description', n.detail === 'Totally new failure', n.detail);
  ok('unknown codes still offer a resend', n.action === 'resend');
}

// A bare error with no description must not render an empty box.
{
  const n = parseAuthNotice('?error=access_denied', '');
  ok('bare error has a usable detail', Boolean(n.detail && n.detail.length > 10), n.detail);
}

// Success paths.
{
  const n = parseAuthNotice('?type=signup', '');
  ok('signup confirmation is a success notice', n?.kind === 'success', n?.kind);
  ok('success has no resend action', n.action === null);
}

// Clean URLs produce nothing at all.
ok('no params => no notice', parseAuthNotice('', '') === null);
ok('unrelated params => no notice', parseAuthNotice('?tab=work', '') === null);

// Recovery detection must not fire when the link errored — otherwise the user
// gets a "set a new password" form backed by a dead token.
ok('recovery detected', isRecovery('', '#type=recovery&access_token=abc'));
ok('recovery via query', isRecovery('?type=recovery', ''));
ok(
  'errored recovery is NOT treated as recovery',
  !isRecovery('', '#type=recovery&error=access_denied&error_code=otp_expired'),
  'would show a password form backed by a dead token'
);
ok('no recovery on a clean url', !isRecovery('', ''));

// Tokens must be on the scrub list — they should never persist in history.
for (const key of ['access_token', 'refresh_token', 'error_code', 'type']) {
  ok(`scrubs ${key} from the URL`, AUTH_PARAMS.includes(key));
}

console.log(fails ? `\n${fails} FAILING` : '\nAll green');
process.exit(fails ? 1 : 0);
