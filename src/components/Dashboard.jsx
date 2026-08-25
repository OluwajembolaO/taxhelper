import { useMemo } from 'react';
import SummaryCards from './SummaryCards.jsx';
import ReserveProgress from './ReserveProgress.jsx';
import PayPeriodCard from './PayPeriodCard.jsx';
import IncomeOverTime from './charts/IncomeOverTime.jsx';
import IncomeVsExpenses from './charts/IncomeVsExpenses.jsx';
import CategoryBreakdown from './charts/CategoryBreakdown.jsx';
import { useStore } from '../hooks/useStore.jsx';
import { reserveStatus, fmtMoney } from '../domain/tax.js';
import { reconcile } from '../domain/work.js';

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
            {recon.problemRows.length} shift(s).
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

      <IncomeOverTime entries={entries} />

      <div className="grid grid--2">
        <IncomeVsExpenses entries={entries} />
        <CategoryBreakdown entries={entries} />
      </div>
    </div>
  );
}
