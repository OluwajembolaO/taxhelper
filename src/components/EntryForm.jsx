import { useEffect, useState } from 'react';
import { toISO, today } from '../domain/payPeriods.js';

const SUGGESTED = {
  income: ['Gig work', 'Freelance client', 'Tips', 'Bonus', 'Other income'],
  expense: ['Supplies', 'Transport', 'Software', 'Phone / internet', 'Equipment', 'Fees', 'Meals'],
};

const blank = () => ({ date: toISO(today()), amount: '', type: 'income', category: '', note: '' });

export default function EntryForm({ onSave, editing, onCancelEdit }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) setForm({ ...editing, amount: String(editing.amount) });
  }, [editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.date) return setError('Pick a date.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero.');
    setError('');
    onSave({ ...form, amount });
    setForm(blank());
    onCancelEdit?.();
  };

  return (
    <section className="card">
      <header className="card__head">
        <h3 className="card__title">{editing ? 'Edit entry' : 'Add entry'}</h3>
        {editing && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setForm(blank());
              onCancelEdit();
            }}
          >
            Cancel
          </button>
        )}
      </header>

      <form className="card__body form" onSubmit={submit}>
        <div className="toggle toggle--full" role="group" aria-label="Entry type">
          {['income', 'expense'].map((t) => (
            <button
              key={t}
              type="button"
              className={form.type === t ? `is-active is-${t}` : ''}
              aria-pressed={form.type === t}
              onClick={() => setForm((f) => ({ ...f, type: t }))}
            >
              {t === 'income' ? 'Money in' : 'Money out'}
            </button>
          ))}
        </div>

        <div className="form__row">
          <div className="field">
            <label htmlFor="e-date">Date</label>
            <input id="e-date" type="date" value={form.date} onChange={set('date')} required />
          </div>
          <div className="field">
            <label htmlFor="e-amount">Amount</label>
            <input
              id="e-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className="num"
              placeholder="0.00"
              value={form.amount}
              onChange={set('amount')}
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="e-category">Category</label>
          <input
            id="e-category"
            list="category-suggestions"
            placeholder="e.g. Gig work"
            value={form.category}
            onChange={set('category')}
          />
          <datalist id="category-suggestions">
            {SUGGESTED[form.type].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="e-note">Description</label>
          <input id="e-note" placeholder="Optional detail" value={form.note} onChange={set('note')} />
        </div>

        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary form__submit">
          {editing ? 'Save changes' : 'Add to ledger'}
        </button>
      </form>
    </section>
  );
}
