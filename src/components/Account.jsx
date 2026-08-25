import { useState } from 'react';
import { passwordProblem, useAuth } from '../hooks/useAuth.jsx';
import { plural } from '../domain/tax.js';

function relativeTime(iso) {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Shown when the user arrives from a password-reset link. */
function SetNewPassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hint = password ? passwordProblem(password) : null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) setError(result.error);
    setPassword('');
  };

  return (
    <div className="card__body form">
      <p className="field__hint">
        You followed a password-reset link. Choose a new password to finish — this link only works once.
      </p>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <p className="field__hint">{hint || 'At least 10 characters.'}</p>
        </div>
        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary form__submit" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}

function SignedIn() {
  const { user, syncState, signOut, runSync } = useAuth();
  const tone = { ok: 'good', syncing: 'mute', error: 'bad', idle: 'mute' }[syncState.status];

  return (
    <div className="card__body form">
      <div className="account__row">
        <div>
          <p className="account__email">{user.email}</p>
          <p className="field__hint">
            Synced {relativeTime(syncState.at)}
            {syncState.pending > 0 && ` · ${plural(syncState.pending, 'change')} waiting to upload`}
          </p>
        </div>
        <span className={`pill pill--${tone}`}>
          {syncState.status === 'syncing' ? 'Syncing' : syncState.status === 'error' ? 'Error' : 'Synced'}
        </span>
      </div>

      {syncState.error && (
        <p className="form__error" role="alert">
          {syncState.error}
        </p>
      )}

      <p className="field__hint">
        Your shifts, ledger, and proof files are on every device you sign in to. The app keeps working
        offline — changes upload when you are back online.
      </p>

      <div className="btnrow">
        <button type="button" onClick={runSync}>
          Sync now
        </button>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function SignedOut() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const hint = mode === 'signup' && password ? passwordProblem(password) : null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    const result =
      mode === 'signup' ? await signUp(email.trim(), password) : await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.message) setMessage(result.message);
    setPassword('');
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Enter your email address first.');
    setError('');
    const result = await resetPassword(email.trim());
    if (result.error) setError(result.error);
    else setMessage(result.message);
  };

  return (
    <div className="card__body form">
      <div className="toggle toggle--full" role="group" aria-label="Account action">
        {[
          ['signin', 'Sign in'],
          ['signup', 'Create account'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={mode === v ? 'is-active' : ''}
            aria-pressed={mode === v}
            onClick={() => {
              setMode(v);
              setError('');
              setMessage('');
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && (
            <p className="field__hint">
              {hint || 'At least 10 characters. A phrase you will remember beats a short scramble.'}
            </p>
          )}
        </div>

        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form__ok" role="status">
            {message}
          </p>
        )}

        <button type="submit" className="primary form__submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {mode === 'signin' && (
        <button type="button" className="ghost linkish" onClick={forgot}>
          Forgot your password?
        </button>
      )}

      <p className="field__hint">
        An account syncs your data across devices. Without one, TaxHelper still works — everything just
        stays on this device.
      </p>
    </div>
  );
}

export default function Account() {
  const { user, ready, syncConfigured, recovering } = useAuth();

  if (!syncConfigured) {
    return (
      <section className="card">
        <header className="card__head">
          <div>
            <h3 className="card__title">Account</h3>
            <p className="card__hint">Sync is not configured on this deployment</p>
          </div>
          <span className="pill pill--mute">Local only</span>
        </header>
        <div className="card__body">
          <p className="field__hint">
            TaxHelper is running in local-only mode: everything stays in this browser and nothing is sent
            anywhere. To turn on accounts and cross-device sync, set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> — see DEPLOY.md.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h3 className="card__title">Account</h3>
          <p className="card__hint">
            {recovering
              ? 'Finish resetting your password'
              : user
                ? 'Signed in — syncing across your devices'
                : 'Sign in to sync'}
          </p>
        </div>
        <span className={`pill pill--${user ? 'good' : 'mute'}`}>{user ? 'Synced' : 'Local only'}</span>
      </header>
      {!ready ? (
        <p className="empty">Checking your session…</p>
      ) : recovering ? (
        <SetNewPassword />
      ) : user ? (
        <SignedIn />
      ) : (
        <SignedOut />
      )}
    </section>
  );
}
