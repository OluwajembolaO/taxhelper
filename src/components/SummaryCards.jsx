import { fmtMoney } from '../domain/tax.js';

function Card({ label, value, sub, tone }) {
  return (
    <div className={`stat stat--${tone || 'plain'}`}>
      <p className="stat__label">{label}</p>
      <p className="stat__value num">{fmtMoney(value)}</p>
      {sub && <p className="stat__sub">{sub}</p>}
    </div>
  );
}

export default function SummaryCards({ status, taxRate }) {
  return (
    <div className="stats">
      <Card label="Income" value={status.income} tone="income" sub="All money received" />
      <Card label="Expenses" value={status.expenses} tone="expense" sub="Deductible costs" />
      <Card label="Net" value={status.net} tone={status.net >= 0 ? 'good' : 'bad'} sub="Income − expenses" />
      <Card
        label="Est. tax owed"
        value={status.owed}
        tone="reserve"
        sub={`${Math.round(taxRate * 100)}% of net · keep aside`}
      />
    </div>
  );
}
