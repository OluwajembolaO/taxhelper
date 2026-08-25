import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { Legend, MoneyTooltip } from './ChartFrame.jsx';
import { hoursByWeek } from '../../domain/work.js';
import { fmtCompact, fmtMoney } from '../../domain/tax.js';

/** Owed vs. actually received, per week — the gap is the story. */
export default function HoursChart({ shifts }) {
  const data = hoursByWeek(shifts).slice(-12);
  return (
    <ChartFrame
      title="Owed vs. received, by week"
      hint="Any gap is money you have not been paid"
      empty={!data.length}
      emptyText="Log a shift to see your weekly totals."
      legend={<Legend items={[{ label: 'Expected', color: 'var(--series-1)' }, { label: 'Received', color: 'var(--series-3)' }]} />}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
        <YAxis tickFormatter={fmtCompact} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<MoneyTooltip fmt={fmtMoney} />} cursor={{ fill: 'var(--paper-sunken)' }} />
        <Bar dataKey="expected" name="Expected" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="received" name="Received" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartFrame>
  );
}
