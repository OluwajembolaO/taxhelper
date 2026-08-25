import { useState } from 'react';
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { MoneyTooltip } from './ChartFrame.jsx';
import { byCategory } from '../../domain/aggregate.js';
import { fmtMoney } from '../../domain/tax.js';

const SLOTS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];

/**
 * Horizontal bars rather than a pie: categories are a magnitude comparison, and
 * bars let every slice carry a direct value label (which the light-mode
 * contrast warning on slots 3–5 obliges).
 */
export default function CategoryBreakdown({ entries }) {
  const [type, setType] = useState('expense');
  const all = byCategory(entries, type);
  // Past five categories, the tail folds into "Other" — never a generated hue.
  const data = all.length > 5 ? [...all.slice(0, 4), { name: 'Other', value: all.slice(4).reduce((a, c) => a + c.value, 0) }] : all;

  return (
    <ChartFrame
      title="Where it goes"
      hint={`${type === 'expense' ? 'Expenses' : 'Income'} by category`}
      empty={!data.length}
      emptyText={`No ${type} entries yet.`}
      height={Math.max(160, data.length * 42)}
      legend={
        <div className="toggle" role="group" aria-label="Category breakdown type">
          {['expense', 'income'].map((t) => (
            <button key={t} type="button" className={type === t ? 'is-active' : ''} onClick={() => setType(t)} aria-pressed={type === t}>
              {t === 'expense' ? 'Expenses' : 'Income'}
            </button>
          ))}
        </div>
      }
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-primary)', fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip content={<MoneyTooltip fmt={fmtMoney} />} cursor={{ fill: 'var(--paper-sunken)' }} />
        <Bar dataKey="value" name={type === 'expense' ? 'Expenses' : 'Income'} radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={d.name === 'Other' ? 'var(--ink-muted)' : SLOTS[i % SLOTS.length]} />
          ))}
          <LabelList dataKey="value" position="right" formatter={fmtMoney} style={{ fill: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
