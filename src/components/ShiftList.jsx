import { useMemo, useState } from 'react';
import Attachments from './Attachments.jsx';
import { fmtMoney } from '../domain/tax.js';
import { fmtDate, parseDate } from '../domain/payPeriods.js';
import { STATUS_META, shiftDiff, shiftStatus } from '../domain/work.js';

const FILTERS = [
  ['all', 'All'],
  ['problem', 'Needs chasing'],
  ['unpaid', 'Unpaid'],
  ['paid', 'Paid'],
];

/** Inline "mark paid" control — the amount that ACTUALLY landed, not the expected one. */
function PaidControl({ shift, onSave }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(shift.expected));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  if (shift.paidAmount != null) {
    return (
      <button
        type="button"
        className="ghost linkish"
        onClick={() => onSave({ ...shift, paidAmount: null, paidDate: null })}
      >
        Undo payment
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" className="primary btn--sm" onClick={() => setOpen(true)}>
        Mark paid
      </button>
    );
  }

  return (
    <form
      className="paidform"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...shift, paidAmount: Number(amount), paidDate: date });
        setOpen(false);
      }}
    >
      <div className="field">
        <label htmlFor={`p-amt-${shift.id}`}>Amount that actually landed</label>
        <input
          id={`p-amt-${shift.id}`}
          type="number"
          step="0.01"
          min="0"
          className="num"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor={`p-date-${shift.id}`}>Date paid</label>
        <input id={`p-date-${shift.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="paidform__actions">
        <button type="submit" className="primary btn--sm">
          Save
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ShiftRow({ shift, graceDays, onEdit, onDelete, onSave, onAddAttachment, onRemoveAttachment }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const status = shiftStatus(shift, graceDays);
  const meta = STATUS_META[status];
  const diff = shiftDiff(shift);
  const short = shift.paidAmount != null && diff < -0.005;

  return (
    <li className={`shift shift--${status}`}>
      <div className="shift__main">
        <button
          type="button"
          className="ghost shift__toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="shift__date num">
            {fmtDate(parseDate(shift.date), { month: 'short', day: 'numeric' })}
          </span>
          <span className="shift__who">
            <span className="shift__employer">{shift.employer}</span>
            <span className="shift__basis num">
              {shift.flatAmount != null
                ? 'flat fee'
                : `${shift.hours}h × ${fmtMoney(shift.rate)}`}
              {shift.role ? ` · ${shift.role}` : ''}
            </span>
          </span>
        </button>

        <span className="shift__money">
          <span className="num shift__expected">{fmtMoney(shift.expected)}</span>
          {shift.paidAmount != null && (
            <span className={`num shift__paid ${short ? 'num--neg' : 'num--pos'}`}>
              got {fmtMoney(shift.paidAmount)}
            </span>
          )}
        </span>

        <span className={`pill pill--${meta.tone}`} title={meta.hint}>
          {meta.label}
        </span>

        {shift.attachments?.length > 0 && (
          <span className="shift__clip" title={`${shift.attachments.length} attachment(s)`}>
            📎<span className="num">{shift.attachments.length}</span>
          </span>
        )}
      </div>

      {(status === 'underpaid' || status === 'unpaid') && (
        <p className="shift__alert num">
          {status === 'unpaid'
            ? `${fmtMoney(shift.expected)} outstanding`
            : `Short by ${fmtMoney(Math.abs(diff))}`}
        </p>
      )}

      {expanded && (
        <div className="shift__detail">
          {(shift.startTime || shift.endTime) && (
            <p className="shift__times num">
              {shift.startTime || '?'} → {shift.endTime || '?'}
            </p>
          )}
          {shift.note && <p className="shift__note">{shift.note}</p>}

          <Attachments shift={shift} onAdd={onAddAttachment} onRemove={onRemoveAttachment} />

          <div className="shift__actions">
            <PaidControl shift={shift} onSave={onSave} />
            <button type="button" className="ghost" onClick={() => onEdit(shift)}>
              Edit
            </button>
            {confirm ? (
              <button type="button" className="ghost danger" onClick={() => onDelete(shift.id)}>
                Confirm delete
              </button>
            ) : (
              <button type="button" className="ghost danger" onClick={() => setConfirm(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function ShiftList({ shifts, graceDays, ...handlers }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shifts.filter((s) => {
      const status = shiftStatus(s, graceDays);
      const passes =
        filter === 'all' ||
        (filter === 'problem' && (status === 'unpaid' || status === 'underpaid')) ||
        (filter === 'unpaid' && (status === 'unpaid' || status === 'awaiting')) ||
        (filter === 'paid' && (status === 'paid' || status === 'overpaid'));
      const matches =
        !q ||
        s.employer.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        s.note.toLowerCase().includes(q);
      return passes && matches;
    });
  }, [shifts, filter, query, graceDays]);

  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h3 className="card__title">Work log</h3>
          <p className="card__hint">
            {rows.length} of {shifts.length} shifts · tap one to open its proof
          </p>
        </div>
      </header>

      <div className="listtools">
        <div className="toggle" role="group" aria-label="Filter shifts">
          {FILTERS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={filter === v ? 'is-active' : ''}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search employer, role, note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shifts"
        />
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {shifts.length === 0
            ? 'No shifts logged yet. Log one the day you work it.'
            : 'No shifts match this filter.'}
        </p>
      ) : (
        <ul className="shiftlist">
          {rows.map((s) => (
            <ShiftRow key={s.id} shift={s} graceDays={graceDays} {...handlers} />
          ))}
        </ul>
      )}
    </section>
  );
}
