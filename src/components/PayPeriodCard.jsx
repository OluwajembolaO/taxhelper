import { useState } from 'react';
import { useStore } from '../hooks/useStore.jsx';
import {
  currentPeriodStatus, describePeriod, fmtDate, relativeDays, upcoming,
} from '../domain/payPeriods.js';
import { fmtMoney } from '../domain/tax.js';

const TONE = { paid: 'good', overdue: 'bad', 'due-today': 'warn', upcoming: 'mute' };
const HEADLINE = {
  paid: 'Payment received',
  overdue: 'Payment overdue',
  'due-today': 'Payday is today',
  upcoming: 'Next expected pay',
};

export default function PayPeriodCard() {
  const { settings, paidPeriods, markPeriodPaid, unmarkPeriodPaid } = useStore();
  const period = currentPeriodStatus(settings.payPeriod, paidPeriods);
  const [amount, setAmount] = useState('');
  const next = upcoming(settings.payPeriod, 4).slice(0, 4);

  const expected = settings.payPeriod.expectedAmount || 0;

  return (
    <section className="card payperiod">
      <header className="card__head">
        <div>
          <h3 className="card__title">{HEADLINE[period.state]}</h3>
          <p className="card__hint">{describePeriod(settings.payPeriod)}</p>
        </div>
        <span className={`pill pill--${TONE[period.state]}`}>
          {period.state === 'paid' ? 'Settled' : relativeDays(period.daysUntil)}
        </span>
      </header>

      <div className="card__body">
        <p className="payperiod__date">{fmtDate(period.dueDate, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        {expected > 0 && (
          <p className="payperiod__amount num">{fmtMoney(expected)} <span>expected</span></p>
        )}

        {period.paid ? (
          <div className="payperiod__settled">
            <p className="num">
              Received {fmtMoney(period.paidRecord.amount)}
              {expected > 0 && Math.abs(period.paidRecord.amount - expected) > 0.005 && (
                <span className={period.paidRecord.amount < expected ? 'num--neg' : 'num--pos'}>
                  {' '}({period.paidRecord.amount < expected ? '−' : '+'}
                  {fmtMoney(Math.abs(period.paidRecord.amount - expected))} vs. expected)
                </span>
              )}
            </p>
            <button type="button" className="ghost" onClick={() => unmarkPeriodPaid(period.dueDate)}>
              Undo
            </button>
          </div>
        ) : (
          <form
            className="payperiod__form"
            onSubmit={(e) => {
              e.preventDefault();
              markPeriodPaid(period.dueDate, amount === '' ? expected : Number(amount));
              setAmount('');
            }}
          >
            <div className="field">
              <label htmlFor="received">Amount received</label>
              <input
                id="received"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="num"
                placeholder={expected ? String(expected) : '0.00'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <button type="submit" className="primary">Mark received</button>
          </form>
        )}

        <details className="payperiod__upcoming">
          <summary>Upcoming pay dates</summary>
          <ul>
            {next.map((d) => (
              <li key={d.toISOString()}>
                <span>{fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className="num">{expected > 0 ? fmtMoney(expected) : '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
