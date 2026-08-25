import { useRef, useState } from 'react';
import Account from './Account.jsx';
import { useStore } from '../hooks/useStore.jsx';
import { useNotifications } from '../hooks/useNotifications.js';
import { describePeriod } from '../domain/payPeriods.js';

const MODES = [
  ['weekly', 'Weekly'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly'],
  ['custom', 'Custom'],
];

export default function Settings() {
  const { settings, updateSettings, repository, reload } = useStore();
  const { supported, permission, request, show, checkNow } = useNotifications();
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);

  const setPeriod = (patch) =>
    updateSettings((s) => ({ ...s, payPeriod: { ...s.payPeriod, ...patch } }));
  const setWork = (patch) => updateSettings((s) => ({ ...s, work: { ...s.work, ...patch } }));

  const exportData = async () => {
    const data = await repository.exportAll();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `taxhelper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      await repository.importAll(data);
      await reload();
      setStatus(`Imported ${data.entries?.length || 0} entries and ${data.shifts?.length || 0} shifts.`);
    } catch {
      setStatus('That file could not be read as a TaxHelper backup.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="page page--settings">
      <Account />

      <section className="card">
        <header className="card__head">
          <div>
            <h3 className="card__title">Pay period</h3>
            <p className="card__hint">{describePeriod(settings.payPeriod)}</p>
          </div>
        </header>
        <div className="card__body form">
          <div className="field">
            <label htmlFor="mode">How often you get paid</label>
            <select
              id="mode"
              value={settings.payPeriod.mode}
              onChange={(e) => setPeriod({ mode: e.target.value })}
            >
              {MODES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="form__row">
            <div className="field">
              <label htmlFor="anchor">A date you were paid</label>
              <input
                id="anchor"
                type="date"
                value={settings.payPeriod.anchorDate}
                onChange={(e) => setPeriod({ anchorDate: e.target.value })}
              />
              <p className="field__hint">Every future pay date is counted from here.</p>
            </div>
            {settings.payPeriod.mode === 'custom' && (
              <div className="field">
                <label htmlFor="interval">Days between pays</label>
                <input
                  id="interval"
                  type="number"
                  min="1"
                  step="1"
                  className="num"
                  value={settings.payPeriod.intervalDays}
                  onChange={(e) => setPeriod({ intervalDays: Number(e.target.value) || 1 })}
                />
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="expected">Typical amount per pay</label>
            <input
              id="expected"
              type="number"
              min="0"
              step="0.01"
              className="num"
              placeholder="0.00"
              value={settings.payPeriod.expectedAmount}
              onChange={(e) => setPeriod({ expectedAmount: Number(e.target.value) || 0 })}
            />
            <p className="field__hint">Used to flag a pay that comes in light.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card__head">
          <div>
            <h3 className="card__title">Work log defaults</h3>
            <p className="card__hint">Prefilled every time you log a shift</p>
          </div>
        </header>
        <div className="card__body form">
          <div className="form__row">
            <div className="field">
              <label htmlFor="def-employer">Usual employer / gig</label>
              <input
                id="def-employer"
                placeholder="e.g. Handshake"
                value={settings.work?.defaultEmployer || ''}
                onChange={(e) => setWork({ defaultEmployer: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="def-rate">Usual hourly rate</label>
              <input
                id="def-rate"
                type="number"
                min="0"
                step="0.01"
                className="num"
                placeholder="0.00"
                value={settings.work?.defaultRate || ''}
                onChange={(e) => setWork({ defaultRate: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <label className="checkline">
            <input
              type="checkbox"
              checked={settings.work?.autoIncome !== false}
              onChange={(e) => setWork({ autoIncome: e.target.checked })}
            />
            <span>Paid shifts post to the ledger as income automatically</span>
          </label>
        </div>
      </section>

      <section className="card">
        <header className="card__head">
          <div>
            <h3 className="card__title">Reminders</h3>
            <p className="card__hint">Payday, overdue pay, and tax-reserve nudges</p>
          </div>
          <span className={`pill pill--${permission === 'granted' ? 'good' : 'mute'}`}>
            {supported ? permission : 'unsupported'}
          </span>
        </header>
        <div className="card__body form">
          {!supported ? (
            <p className="field__hint">This browser does not support notifications.</p>
          ) : permission !== 'granted' ? (
            <>
              <p className="field__hint">
                Allow notifications to be reminded before payday, when a payment is late, and when it is
                time to move money into your tax reserve.
              </p>
              <button type="button" className="primary" onClick={request}>
                Enable reminders
              </button>
            </>
          ) : (
            <>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={settings.notify.enabled}
                  onChange={(e) =>
                    updateSettings((s) => ({ ...s, notify: { ...s.notify, enabled: e.target.checked } }))
                  }
                />
                <span>Reminders on</span>
              </label>
              <div className="field">
                <label htmlFor="lead">Warn me this many days before payday</label>
                <input
                  id="lead"
                  type="number"
                  min="0"
                  max="14"
                  step="1"
                  className="num"
                  value={settings.notify.leadDays}
                  onChange={(e) =>
                    updateSettings((s) => ({
                      ...s,
                      notify: { ...s.notify, leadDays: Number(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="btnrow">
                <button type="button" onClick={() => show('TaxHelper', 'Reminders are working.', 'test')}>
                  Send a test
                </button>
                <button type="button" onClick={checkNow}>
                  Check now
                </button>
              </div>
              <p className="field__hint">
                These fire while the app is installed and opened at least occasionally — the browser
                schedules them on this device. Reminders that arrive with the app fully closed need a push
                server; see the README for that trade-off.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card__head">
          <div>
            <h3 className="card__title">Your data</h3>
            <p className="card__hint">Everything lives in this browser and nowhere else</p>
          </div>
        </header>
        <div className="card__body form">
          <div className="btnrow">
            <button type="button" onClick={exportData}>
              Export backup (JSON)
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="visually-hidden"
              onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
            />
          </div>
          {status && <p className="field__hint" role="status">{status}</p>}
          <p className="field__hint">
            Clearing your browser's site data deletes it. Export a backup before you switch phones or
            clear your browser — and keep one around tax time.
          </p>
        </div>
      </section>
    </div>
  );
}
