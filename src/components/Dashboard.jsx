import { lazy, Suspense, useMemo } from 'react';
import SummaryCards from './SummaryCards.jsx';
import ReserveProgress from './ReserveProgress.jsx';
import PayPeriodCard from './PayPeriodCard.jsx';
import ChartFallback from './charts/ChartFallback.jsx';
import { useStore } from '../hooks/useStore.jsx';
import { reserveStatus, fmtMoney, plural } from '../domain/tax.js';
import { reconcile } from '../domain/work.js';

// Charts are the heaviest dependency in the app and sit below the fold on
// mobile — load them after the numbers that matter are already on screen.
const IncomeOverTime = lazy(() => import('./charts/IncomeOverTime.jsx'));
const IncomeVsExpenses = lazy(() => import('./charts/IncomeVsExpenses.jsx'));
const CategoryBreakdown = lazy(() => import('./charts/CategoryBreakdown.jsx'));

export default function Dashboard({ onGoToWork }) {
  const { entries, shifts, settings, updateSettings } = useStore();

  const status = useMemo(
    () => reserveStatus(entries, settings.taxRate, settings.setAside),
    [entries, settings.taxRate, settings.setAside]
  );
  const recon = useMemo(() => reconcile(shifts), [shifts]);

  return (
    <div className="page">
      {recon.atRisk > 0.005 && (
        <button type="button" className="alertbar" onClick={onGoToWork}>
          <span className="alertbar__dot" aria-hidden="true" />
          <span>
            <strong className="num">{fmtMoney(recon.atRisk)}</strong> is unpaid or short across{' '}
            {plural(recon.problemRows.length, 'shift')}.
          </span>
          <span className="alertbar__cta">Review →</span>
        </button>
      )}

      <SummaryCards status={status} taxRate={settings.taxRate} />

      <div className="grid grid--2">
        <PayPeriodCard />
        <ReserveProgress
          status={status}
          taxRate={settings.taxRate}
          onRateChange={(taxRate) => updateSettings({ taxRate })}
          setAside={settings.setAside}
          onSetAsideChange={(setAside) => updateSettings({ setAside })}
        />
      </div>

      <Suspense fallback={<ChartFallback title="Net position over time" />}>
        <IncomeOverTime entries={entries} />
      </Suspense>

      <div className="grid grid--2">
        <Suspense fallback={<ChartFallback title="Income vs. expenses by month" />}>
          <IncomeVsExpenses entries={entries} />
        </Suspense>
        <Suspense fallback={<ChartFallback title="Where it goes" />}>
          <CategoryBreakdown entries={entries} />
        </Suspense>
      </div>
    </div>
  );
}
