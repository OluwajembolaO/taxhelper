import { useMemo, useState } from 'react';
import OwedBanner from './OwedBanner.jsx';
import ShiftForm from './ShiftForm.jsx';
import ShiftList from './ShiftList.jsx';
import HoursChart from './charts/HoursChart.jsx';
import { useStore } from '../hooks/useStore.jsx';
import { byEmployer, reconcile } from '../domain/work.js';
import { fmtMoney } from '../domain/tax.js';

const GRACE_DAYS = 14;

function EmployerTable({ shifts }) {
  const rows = byEmployer(shifts, GRACE_DAYS);
  if (!rows.length) return null;
  return (
    <section className="card">
      <header className="card__head">
        <div>
          <h3 className="card__title">By employer</h3>
          <p className="card__hint">Who pays what they owe, and who does not</p>
        </div>
      </header>
      <div className="tablewrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Employer</th>
              <th className="is-num">Shifts</th>
              <th className="is-num">Hours</th>
              <th className="is-num">Billed</th>
              <th className="is-num">Received</th>
              <th className="is-num">Short</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num is-num">{r.shifts}</td>
                <td className="num is-num">{r.hours.toFixed(2)}</td>
                <td className="num is-num">{fmtMoney(r.expected)}</td>
                <td className="num is-num">{fmtMoney(r.received)}</td>
                <td className={`num is-num ${r.shorted > 0.005 ? 'num--neg' : ''}`}>
                  {r.shorted > 0.005 ? fmtMoney(r.shorted) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function WorkLog() {
  const { shifts, settings, saveShift, deleteShift, addAttachment, removeAttachment } = useStore();
  const [editing, setEditing] = useState(null);

  const recon = useMemo(() => reconcile(shifts, GRACE_DAYS), [shifts]);

  return (
    <div className="page page--work">
      <OwedBanner recon={recon} />

      <div className="page__cols">
        <div className="page__aside">
          <ShiftForm
            onSave={(s) => saveShift(editing ? { ...editing, ...s } : s)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            defaults={{ employer: settings.work?.defaultEmployer, rate: settings.work?.defaultRate }}
          />
        </div>

        <div className="page__main">
          <ShiftList
            shifts={shifts}
            graceDays={GRACE_DAYS}
            onEdit={(s) => {
              setEditing(s);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDelete={deleteShift}
            onSave={saveShift}
            onAddAttachment={addAttachment}
            onRemoveAttachment={removeAttachment}
          />
          <HoursChart shifts={shifts} />
          <EmployerTable shifts={shifts} />
        </div>
      </div>
    </div>
  );
}
