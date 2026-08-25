/** Placeholder that holds the chart's space while its code loads. */
export default function ChartFallback({ title, height = 240 }) {
  return (
    <section className="card chart">
      <header className="card__head">
        <h3 className="card__title">{title}</h3>
      </header>
      <div className="card__body chart__body">
        <div className="chart__skeleton" style={{ height }} aria-hidden="true" />
        <span className="visually-hidden">Loading chart…</span>
      </div>
    </section>
  );
}
