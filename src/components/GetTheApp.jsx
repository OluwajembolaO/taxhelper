import { useEffect, useState } from 'react';

// Stable across versions: GitHub redirects /latest/download/<name> to whatever
// the newest release carries, so this URL never needs updating.
const DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_URL ||
  'https://github.com/OluwajembolaO/taxhelper/releases/latest/download/TaxHelper-Setup.exe';

const isWindows = () =>
  typeof navigator !== 'undefined' &&
  /win/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** True when the page is already running as an installed app, not a browser tab. */
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true);

export default function GetTheApp() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Chrome/Edge fire this when the app meets the install criteria. Capturing
    // it lets us offer a real button instead of describing a menu path.
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setStatus('Installed — look for TaxHelper in your Start menu.');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'dismissed') setStatus('Install cancelled — you can do it any time.');
    setPrompt(null);
  };

  return (
    <section className="card getapp">
      <header className="card__head">
        <div>
          <h3 className="card__title">Get the app</h3>
          <p className="card__hint">Install it so it opens like any other app — and works offline</p>
        </div>
        {installed && <span className="pill pill--good">Installed</span>}
      </header>

      <div className="card__body getapp__body">
        {installed ? (
          <p className="field__hint">
            You are running the installed app. It works offline, and updates itself whenever a new
            version is deployed.
          </p>
        ) : (
          <div className="getapp__option">
            <div className="getapp__text">
              <h4>Install from your browser</h4>
              <p>
                Free, about 1&nbsp;MB, and <strong>updates itself</strong>. Gets its own window, an icon in
                your Start menu or dock, and works with no internet.
              </p>
            </div>
            {prompt ? (
              <button type="button" className="primary" onClick={install}>
                Install TaxHelper
              </button>
            ) : (
              <p className="getapp__manual">
                {isIOS()
                  ? 'In Safari: Share → Add to Home Screen. On iPhone this is also what makes reminders work.'
                  : 'In Chrome or Edge: click the install icon in the address bar, or ⋮ → Cast, save, and share → Install page as app.'}
              </p>
            )}
          </div>
        )}

        {isWindows() && (
          <div className="getapp__option getapp__option--alt">
            <div className="getapp__text">
              <h4>Windows installer</h4>
              <p>
                A standalone <code>.exe</code> that does not need Chrome or Edge. About 109&nbsp;MB, installs
                without admin rights. It does <strong>not</strong> update itself — download a newer release
                to upgrade.
              </p>
            </div>
            <a className="getapp__download" href={DOWNLOAD_URL} rel="noreferrer">
              Download for Windows
            </a>
          </div>
        )}

        {status && (
          <p className="form__ok" role="status">
            {status}
          </p>
        )}

        <p className="field__hint">
          The installer is unsigned, so Windows will warn you the first time: click{' '}
          <strong>More info → Run anyway</strong>. Signing costs money, so this build skips it.
        </p>
      </div>
    </section>
  );
}
