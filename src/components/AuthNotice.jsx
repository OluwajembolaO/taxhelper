import { useAuth } from '../hooks/useAuth.jsx';

/**
 * Explains the outcome of an email link in plain language.
 *
 * Rendered at app level rather than inside Settings: a failed reset link drops
 * the user on whatever tab they last used, so a message tucked into Account
 * would never be seen — which is exactly how an expired link ended up looking
 * like nothing happening at all.
 */
export default function AuthNotice({ onGoToAccount }) {
  const { notice, dismissNotice } = useAuth();
  if (!notice) return null;

  const isError = notice.kind === 'error';

  return (
    <aside className={`authnotice authnotice--${isError ? 'error' : 'success'}`} role="alert">
      <div className="authnotice__body">
        <p className="authnotice__title">{notice.title}</p>
        <p className="authnotice__detail">{notice.detail}</p>
      </div>

      <div className="authnotice__actions">
        {notice.action === 'resend' && (
          <button
            type="button"
            className="primary btn--sm"
            onClick={() => {
              onGoToAccount?.();
              dismissNotice();
            }}
          >
            Send a new link
          </button>
        )}
        {notice.action === 'signin' && (
          <button
            type="button"
            className="primary btn--sm"
            onClick={() => {
              onGoToAccount?.();
              dismissNotice();
            }}
          >
            Go to sign in
          </button>
        )}
        <button
          type="button"
          className="ghost authnotice__dismiss"
          onClick={dismissNotice}
          aria-label="Dismiss this message"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
