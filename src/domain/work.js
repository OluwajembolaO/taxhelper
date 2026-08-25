// Reconciliation: what you were owed vs. what actually landed.
// This is the "proof" half of the app — it exists so a short payment is a
// visible, dated, evidenced fact rather than a vague feeling.

import { daysBetween, parseDate, today } from './payPeriods.js';

const CENT = 0.01;

/**
 * status: 'paid' | 'underpaid' | 'overpaid' | 'unpaid' | 'awaiting'
 *  - unpaid   : expected pay is past due (older than graceDays) and nothing logged
 *  - awaiting : worked recently, payment not logged yet, still inside the grace window
 *  - underpaid: money arrived but less than expected  ← the one to chase
 */
export function shiftStatus(shift, graceDays = 14, ref = today()) {
  const expected = Number(shift.expected) || 0;
  if (shift.paidAmount == null) {
    const age = daysBetween(parseDate(shift.date), ref);
    return age > graceDays ? 'unpaid' : 'awaiting';
  }
  const diff = shift.paidAmount - expected;
  if (Math.abs(diff) < CENT) return 'paid';
  return diff < 0 ? 'underpaid' : 'overpaid';
}

export function shiftDiff(shift) {
  if (shift.paidAmount == null) return -(Number(shift.expected) || 0);
  return shift.paidAmount - (Number(shift.expected) || 0);
}

/** Portfolio-level view of every shift. */
export function reconcile(shifts, graceDays = 14, ref = today()) {
  const rows = shifts.map((s) => ({ ...s, status: shiftStatus(s, graceDays, ref), diff: shiftDiff(s) }));

  const sum = (pred, pick) => rows.filter(pred).reduce((a, r) => a + pick(r), 0);

  const owedRows = rows.filter((r) => r.status === 'unpaid' || r.status === 'underpaid' || r.status === 'awaiting');
  const problemRows = rows.filter((r) => r.status === 'unpaid' || r.status === 'underpaid');

  return {
    rows,
    problemRows: problemRows.sort((a, b) => (a.date < b.date ? 1 : -1)),
    totalHours: rows.reduce((a, r) => a + (Number(r.hours) || 0), 0),
    totalExpected: rows.reduce((a, r) => a + (Number(r.expected) || 0), 0),
    totalReceived: sum((r) => r.paidAmount != null, (r) => r.paidAmount),
    outstanding: owedRows.reduce(
      (a, r) => a + (r.paidAmount == null ? Number(r.expected) || 0 : Math.max(0, -r.diff)),
      0
    ),
    // Money that is late or provably short — the number worth arguing about.
    atRisk: problemRows.reduce(
      (a, r) => a + (r.paidAmount == null ? Number(r.expected) || 0 : Math.max(0, -r.diff)),
      0
    ),
    counts: rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}),
  };
}

/** Effective hourly rate actually realized, vs. the rate agreed. */
export function realizedRate(rows) {
  const hours = rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
  const received = rows.reduce((a, r) => a + (r.paidAmount ?? 0), 0);
  return hours > 0 ? received / hours : 0;
}

export function byEmployer(shifts, graceDays = 14) {
  const map = new Map();
  for (const s of shifts) {
    const k = s.employer || 'Unspecified';
    const b = map.get(k) || { name: k, hours: 0, expected: 0, received: 0, shorted: 0, shifts: 0 };
    const status = shiftStatus(s, graceDays);
    b.shifts += 1;
    b.hours += Number(s.hours) || 0;
    b.expected += Number(s.expected) || 0;
    b.received += s.paidAmount ?? 0;
    if (status === 'unpaid') b.shorted += Number(s.expected) || 0;
    if (status === 'underpaid') b.shorted += Math.abs(shiftDiff(s));
    map.set(k, b);
  }
  return [...map.values()].sort((a, b) => b.expected - a.expected);
}

export const STATUS_META = {
  paid:      { label: 'Paid',      tone: 'good', hint: 'Amount matched what was owed.' },
  underpaid: { label: 'Underpaid', tone: 'bad',  hint: 'You were paid less than the logged hours are worth.' },
  overpaid:  { label: 'Overpaid',  tone: 'warn', hint: 'More than expected arrived — worth confirming.' },
  unpaid:    { label: 'Unpaid',    tone: 'bad',  hint: 'Past the grace window with no payment logged.' },
  awaiting:  { label: 'Awaiting',  tone: 'mute', hint: 'Worked recently, payment not logged yet.' },
};

/** Hours worked per ISO week, for the hours chart. */
export function hoursByWeek(shifts) {
  const map = new Map();
  for (const s of shifts) {
    const d = parseDate(s.date);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const b = map.get(key) || { key, hours: 0, expected: 0, received: 0 };
    b.hours += Number(s.hours) || 0;
    b.expected += Number(s.expected) || 0;
    b.received += s.paidAmount ?? 0;
    map.set(key, b);
  }
  return [...map.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((b) => ({
      ...b,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parseDate(b.key)),
    }));
}

/** Plain-text evidence summary you can paste into an email or a text. */
export function disputeSummary(rows, fmt) {
  const problems = rows.filter((r) => r.status === 'unpaid' || r.status === 'underpaid');
  if (!problems.length) return 'No unpaid or underpaid shifts on record.';
  const lines = problems.map((r) => {
    const basis = r.flatAmount != null ? 'flat fee' : `${r.hours}h × ${fmt(r.rate)}/hr`;
    const got = r.paidAmount == null ? 'nothing received' : `received ${fmt(r.paidAmount)}`;
    return `• ${r.date} — ${r.employer}${r.role ? ` (${r.role})` : ''}: ${basis} = ${fmt(r.expected)} owed, ${got}, short ${fmt(Math.abs(r.diff))}${r.attachments?.length ? ` [${r.attachments.length} attachment(s) on file]` : ''}`;
  });
  const total = problems.reduce((a, r) => a + (r.paidAmount == null ? r.expected : Math.abs(r.diff)), 0);
  return `Unpaid / underpaid shifts (${problems.length}):\n${lines.join('\n')}\n\nTotal outstanding: ${fmt(total)}`;
}

/** CSV of the full work log — the portable paper trail. */
export function shiftsToCsv(rows, statusOf) {
  const head = ['Date','Employer','Role','Start','End','Hours','Rate','Expected','Paid','Paid date','Difference','Status','Attachments','Note'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [r.date, r.employer, r.role, r.startTime, r.endTime, r.hours, r.rate, r.expected,
     r.paidAmount ?? '', r.paidDate ?? '', (r.diff ?? shiftDiff(r)).toFixed(2),
     r.status ?? statusOf?.(r) ?? '', r.attachments?.length ?? 0, r.note].map(esc).join(',')
  );
  return [head.join(','), ...body].join('\n');
}
