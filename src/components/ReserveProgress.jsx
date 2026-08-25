import { fmtMoney } from '../domain/tax.js';

export default function ReserveProgress({ status, taxRate, onRateChange, setAside, onSetAsideChange }) {
  const pct = Math.round(status.pct * 100);
  const onTrack = status.shortfall < 0.5;

  return (
    <section className="card reserve">
      <header className="card__head">
        <div>
          <h3 className="card__title">Tax reserve</h3>
          <p className="card__hint">What you should be holding back, and what you actually are</p>
        </div>
        <span className={`pill ${onTrack ? 'pill--good' : 'pill--warn'}`}>
          {onTrack ? 'On track' : `${fmtMoney(status.shortfall)} short`}
        </span>
      </header>

      <div className="card__body">
        <div className="reserve__bar" role="img" aria-label={`${pct}% of your tax reserve target is set aside`}>
          <div className={`reserve__fill ${onTrack ? 'is-good' : ''}`} style={{ width: `${pct}%` }} />
          <span className="reserve__pct num">{pct}%</span>
        </div>
        <p className="reserve__caption">
          <strong className="num">{fmtMoney(status.setAside)}</strong> set aside of{' '}
          <strong className="num">{fmtMoney(status.owed)}</strong> target
        </p>

        <div className="field">
          <label htmlFor="taxRate">
            Reserve rate — <span className="num">{Math.round(taxRate * 100)}%</span>
          </label>
          <input
            id="taxRate"
            type="range"
            min="0"
            max="50"
            step="1"
            value={Math.round(taxRate * 100)}
            onChange={(e) => onRateChange(Number(e.target.value) / 100)}
          />
          <p className="field__hint">
            Self-employment tax alone runs ~15.3%; most freelancers reserve 25–30% once federal and
            state income tax are counted. This is an estimate, not tax advice.
          </p>
        </div>

        <div className="field">
          <label htmlFor="setAside">Actually set aside</label>
          <input
            id="setAside"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="num"
            value={setAside}
            onChange={(e) => onSetAsideChange(Number(e.target.value) || 0)}
          />
          <p className="field__hint">Update this when you move money into your tax savings account.</p>
        </div>

        <dl className="reserve__facts">
          <div>
            <dt>Take-home after reserve</dt>
            <dd className="num">{fmtMoney(status.takeHome)}</dd>
          </div>
          <div>
            <dt>Still to move</dt>
            <dd className={`num ${status.shortfall > 0 ? 'num--neg' : 'num--pos'}`}>
              {fmtMoney(status.shortfall)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
