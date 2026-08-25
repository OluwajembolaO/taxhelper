import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { Legend, MoneyTooltip } from './ChartFrame.jsx';
import { byMonth } from '../../domain/aggregate.js';
import { fmtCompact, fmtMoney } from '../../domain/tax.js';

export default function IncomeVsExpenses({ entries }) {
  const data = byMonth(entries);
  return (
    <ChartFrame
      title="Income vs. expenses by month"
      hint="Side by side, same scale"
      empty={!data.length}
      legend={<Legend items={[{ label: 'Income', color: 'var(--series-1)' }, { label: 'Expenses', color: 'var(--series-2)' }]} />}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
        <YAxis tickFormatter={fmtCompact} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<MoneyTooltip fmt={fmtMoney} />} cursor={{ fill: 'var(--paper-sunken)' }} />
        <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expenses" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ChartFrame>
  );
}
