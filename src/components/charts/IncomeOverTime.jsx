import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { MoneyTooltip } from './ChartFrame.jsx';
import { cumulativeNet } from '../../domain/aggregate.js';
import { fmtCompact, fmtMoney } from '../../domain/tax.js';

export default function IncomeOverTime({ entries }) {
  const data = cumulativeNet(entries);
  return (
    <ChartFrame
      title="Net position over time"
      hint="Running total of income minus expenses"
      empty={data.length < 2}
      emptyText="Log at least two entries to draw a trend."
    >
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={24} />
        <YAxis tickFormatter={fmtCompact} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<MoneyTooltip fmt={fmtMoney} />} cursor={{ stroke: 'var(--rule-strong)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="net" name="Net" stroke="var(--series-1)" strokeWidth={2} fill="url(#netFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
      </AreaChart>
    </ChartFrame>
  );
}
