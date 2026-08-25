import { useEffect, useMemo, useState } from 'react';
import { toISO, today } from '../domain/payPeriods.js';
import { fmtMoney } from '../domain/tax.js';

/** Hours between two "HH:MM" strings, rolling past midnight if the end is earlier. */
function hoursBetween(start, end, breakMins) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight shift
  mins -= Number(breakMins) || 0;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

const blank = (defaults) => ({
  date: toISO(today()),
  employer: defaults.employer || '',
  role: '',
  startTime: '',
  endTime: '',
  breakMins: '',
  hours: '',
  rate: defaults.rate ? String(defaults.rate) : '',
  flatAmount: '',
  note: '',
  paidAmount: '',
  paidDate: '',
});

export default function ShiftForm({ onSave, editing, onCancelEdit, defaults }) {
  const [form, setForm] = useState(() => blank(defaults));
  const [flat, setFlat] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    setFlat(editing.flatAmount != null);
    setForm({
      ...blank(defaults),
      ...editing,
      hours: String(editing.hours ?? ''),
      rate: String(editing.rate ?? ''),
      flatAmount: editing.flatAmount == null ? '' : String(editing.flatAmount),
      paidAmount: editing.paidAmount == null ? '' : String(editing.paidAmount),
      paidDate: editing.paidDate || '',
      breakMins: editing.breakMins ?? '',
    });
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Clock times, when both are given, are the source of truth for hours.
  const derivedHours = useMemo(
    () => hoursBetween(form.startTime, form.endTime, form.breakMins),
    [form.startTime, form.endTime, form.breakMins]
  );
  const hours = derivedHours ?? (Number(form.hours) || 0);
  const expected = flat ? Number(form.flatAmount) || 0 : Math.round(hours * (Number(form.rate) || 0) * 100) / 100;

  const reset = () => {
    setForm(blank(defaults));
    setFlat(false);
    onCancelEdit?.();
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.date) return setError('Pick the date you worked.');
    if (!flat && hours <= 0) return setError('Enter your hours, or the start and end time.');
    if (expected <= 0) return setError(flat ? 'Enter the agreed fee.' : 'Enter your hourly rate.');
    setError('');
    onSave({
      ...form,
      hours,
      rate: Number(form.rate) || 0,
      flatAmount: flat ? Number(form.flatAmount) : null,
      paidAmount: form.paidAmount === '' ? null : Number(form.paidAmount),
      paidDate: form.paidDate || null,
      breakMins: form.breakMins,
    });
    reset();
  };

  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h3 className="card__title">{editing ? 'Edit shift' : 'Log a shift'}</h3>
          <p className="card__hint">Record it the day you work it — that record is your proof</p>
        </div>
        {editing && (
          <button type="button" className="ghost" onClick={reset}>
            Cancel
          </button>
        )}
      </header>

      <form className="card__body form" onSubmit={submit}>
        <div className="form__row">
          <div className="field">
            <label htmlFor="s-date">Date worked</label>
            <input id="s-date" type="date" value={form.date} onChange={set('date')} required />
          </div>
          <div className="field">
            <label htmlFor="s-employer">Employer / gig</label>
            <input
              id="s-employer"
              list="employer-suggestions"
              placeholder="e.g. Handshake"
              value={form.employer}
              onChange={set('employer')}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="s-role">Role / job</label>
          <input id="s-role" placeholder="e.g. Event setup" value={form.role} onChange={set('role')} />
        </div>

        <div className="form__row">
          <div className="field">
            <label htmlFor="s-start">Clock in</label>
            <input id="s-start" type="time" value={form.startTime} onChange={set('startTime')} />
          </div>
          <div className="field">
            <label htmlFor="s-end">Clock out</label>
            <input id="s-end" type="time" value={form.endTime} onChange={set('endTime')} />
          </div>
        </div>

        <div className="form__row">
          <div className="field">
            <label htmlFor="s-break">Break (minutes)</label>
            <input
              id="s-break"
              type="number"
              inputMode="numeric"
              min="0"
              step="5"
              className="num"
              placeholder="0"
              value={form.breakMins}
              onChange={set('breakMins')}
            />
          </div>
          <div className="field">
            <label htmlFor="s-hours">Hours</label>
            <input
              id="s-hours"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.25"
              className="num"
              placeholder="0"
              value={derivedHours ?? form.hours}
              onChange={set('hours')}
              readOnly={derivedHours != null}
              aria-describedby={derivedHours != null ? 's-hours-hint' : undefined}
            />
            {derivedHours != null && (
              <p className="field__hint" id="s-hours-hint">
                From your clock times.
              </p>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor={flat ? 's-flat' : 's-rate'}>{flat ? 'Agreed fee' : 'Rate per hour'}</label>
          {flat ? (
            <input
              id="s-flat"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="num"
              placeholder="0.00"
              value={form.flatAmount}
              onChange={set('flatAmount')}
            />
          ) : (
            <input
              id="s-rate"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="num"
              placeholder="0.00"
              value={form.rate}
              onChange={set('rate')}
            />
          )}
          <button type="button" className="ghost linkish" onClick={() => setFlat((v) => !v)}>
            {flat ? 'Use an hourly rate instead' : 'This gig pays a flat fee'}
          </button>
        </div>

        <p className="owed">
          You are owed <strong className="num">{fmtMoney(expected)}</strong>
          {!flat && hours > 0 && Number(form.rate) > 0 && (
            <span className="owed__basis num">
              {' '}
              ({hours}h × {fmtMoney(Number(form.rate))}/hr)
            </span>
          )}
        </p>

        <details className="form__more">
          <summary>Already been paid for this one?</summary>
          <div className="form__row">
            <div className="field">
              <label htmlFor="s-paid">Amount received</label>
              <input
                id="s-paid"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="num"
                placeholder="Leave blank if unpaid"
                value={form.paidAmount}
                onChange={set('paidAmount')}
              />
            </div>
            <div className="field">
              <label htmlFor="s-paiddate">Date paid</label>
              <input id="s-paiddate" type="date" value={form.paidDate} onChange={set('paidDate')} />
            </div>
          </div>
        </details>

        <div className="field">
          <label htmlFor="s-note">Notes</label>
          <input
            id="s-note"
            placeholder="Who assigned it, what was agreed…"
            value={form.note}
            onChange={set('note')}
          />
        </div>

        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary form__submit">
          {editing ? 'Save shift' : 'Log shift'}
        </button>
      </form>
    </section>
  );
}
