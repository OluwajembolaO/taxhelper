import { ResponsiveContainer } from 'recharts';

/** Consistent titled surface + empty state for every chart. */
export default function ChartFrame({ title, hint, legend, height = 240, empty, emptyText, children }) {
  return (
    <section className="card chart">
      <header className="card__head">
        <div>
          <h3 className="card__title">{title}</h3>
          {hint && <p className="card__hint">{hint}</p>}
        </div>
        {legend && <div className="legend">{legend}</div>}
      </header>
      <div className="card__body chart__body">
        {empty ? (
          <p className="empty">{emptyText || 'Not enough data yet.'}</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export function Legend({ items }) {
  return (
    <ul className="legend__list">
      {items.map((it) => (
        <li key={it.label}>
          <span className="legend__swatch" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Shared tooltip: monospace figures, surface-matched, never color-on-color text. */
export function MoneyTooltip({ active, payload, label, fmt, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <p className="tooltip__label">{label}</p>
      <ul>
        {payload.map((p) => (
          <li key={p.dataKey}>
            <span className="legend__swatch" style={{ background: p.color }} aria-hidden="true" />
            <span className="tooltip__name">{p.name}</span>
            <span className="num tooltip__value">{fmt ? fmt(p.value) : p.value}{suffix}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
