import { useState } from 'react';
import { fmtMoney } from '../domain/tax.js';
import { disputeSummary, realizedRate, shiftsToCsv } from '../domain/work.js';

function download(name, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The headline number: money that is late or provably short. This is the whole
 * point of the work log, so it gets the biggest type on the page.
 */
export default function OwedBanner({ recon }) {
  const [copied, setCopied] = useState(false);
  const problems = recon.problemRows;
  const clean = problems.length === 0;
  const realized = realizedRate(recon.rows);

  const copySummary = async () => {
    const text = disputeSummary(recon.rows, fmtMoney);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      download('unpaid-shifts.txt', text);
    }
  };

  return (
    <section className={`owedbanner ${clean ? 'is-clean' : 'is-alert'}`}>
      <div className="owedbanner__lead">
        <p className="owedbanner__label">{clean ? 'Everything reconciled' : 'Owed to you'}</p>
        <p className="owedbanner__value num">{fmtMoney(recon.atRisk)}</p>
        <p className="owedbanner__sub">
          {clean
            ? `${recon.rows.length} shift(s) logged, every one paid in full.`
            : `${problems.length} shift(s) unpaid or short of what you logged.`}
        </p>
      </div>

      <dl className="owedbanner__facts">
        <div>
          <dt>Hours logged</dt>
          <dd className="num">{recon.totalHours.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Billed</dt>
          <dd className="num">{fmtMoney(recon.totalExpected)}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd className="num">{fmtMoney(recon.totalReceived)}</dd>
        </div>
        <div>
          <dt>Real rate/hr</dt>
          <dd className="num">{fmtMoney(realized)}</dd>
        </div>
      </dl>

      <div className="owedbanner__actions">
        <button type="button" onClick={copySummary} disabled={clean}>
          {copied ? 'Copied ✓' : 'Copy the receipts'}
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              `work-log-${new Date().toISOString().slice(0, 10)}.csv`,
              shiftsToCsv(recon.rows),
              'text/csv'
            )
          }
          disabled={!recon.rows.length}
        >
          Export CSV
        </button>
      </div>
    </section>
  );
}
