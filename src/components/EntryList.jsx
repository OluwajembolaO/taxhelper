import { useMemo, useState } from 'react';
import { fmtMoney } from '../domain/tax.js';
import { fmtDate, parseDate } from '../domain/payPeriods.js';

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'category', label: 'Category' },
  { key: 'amount', label: 'Amount', numeric: true },
];

export default function EntryList({ entries, onEdit, onDelete }) {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter(
      (e) =>
        (filter === 'all' || e.type === filter) &&
        (!q || e.category.toLowerCase().includes(q) || e.note.toLowerCase().includes(q))
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * dir;
    });
  }, [entries, sort, filter, query]);

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h3 className="card__title">Ledger</h3>
          <p className="card__hint">
            {rows.length} of {entries.length} entries
          </p>
        </div>
      </header>

      <div className="listtools">
        <div className="toggle" role="group" aria-label="Filter entries">
          {[
            ['all', 'All'],
            ['income', 'In'],
            ['expense', 'Out'],
          ].map(([v, l]) => (
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
          placeholder="Search category or note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search entries"
        />
      </div>

      {rows.length === 0 ? (
        <p className="empty">No entries match. Add one to get started.</p>
      ) : (
        <div className="tablewrap">
          <table className="ledger">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={c.numeric ? 'is-num' : ''}
                    aria-sort={
                      sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button type="button" className="ghost th__sort" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span aria-hidden="true" className="th__arrow">
                        {sort.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={`row row--${e.type}`}>
                  <td className="num row__date">
                    {fmtDate(parseDate(e.date), { month: 'short', day: 'numeric', year: '2-digit' })}
                  </td>
                  <td>
                    <span className="row__cat">{e.category}</span>
                    {e.note && <span className="row__note">{e.note}</span>}
                  </td>
                  <td className={`num is-num ${e.type === 'income' ? 'num--pos' : 'num--neg'}`}>
                    {e.type === 'income' ? '+' : '−'}
                    {fmtMoney(e.amount)}
                  </td>
                  <td className="row__actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onEdit(e)}
                      aria-label={`Edit ${e.category} entry`}
                    >
                      Edit
                    </button>
                    {confirmId === e.id ? (
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => {
                          onDelete(e.id);
                          setConfirmId(null);
                        }}
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => setConfirmId(e.id)}
                        aria-label={`Delete ${e.category} entry`}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
