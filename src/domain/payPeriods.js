// Pay-period schedule maths. Dates are handled as local-noon Date objects so
// DST shifts can never roll a period onto the wrong calendar day.

export const MS_DAY = 86400000;

export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}

export function intervalDays(payPeriod) {
  switch (payPeriod.mode) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'custom':
      return Math.max(1, Number(payPeriod.intervalDays) || 14);
    default:
      return 0; // monthly is not a fixed day count
  }
}

/** Nth pay date after the anchor (n may be negative). */
export function payDateAt(payPeriod, n) {
  const anchor = parseDate(payPeriod.anchorDate);
  if (payPeriod.mode === 'monthly') {
    const d = new Date(anchor);
    const targetDay = anchor.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    // Clamp to the last day of shorter months (31st → 30th/28th).
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, lastDay));
    d.setHours(12, 0, 0, 0);
    return d;
  }
  return new Date(anchor.getTime() + n * intervalDays(payPeriod) * MS_DAY);
}

/** Stable identifier for a period, used as the key in the paid-periods map. */
export const periodKey = (date) => toISO(date);

/**
 * The schedule around `ref`: the period currently due (the most recent pay
 * date that has arrived, or the first upcoming one) plus its neighbours.
 */
export function schedule(payPeriod, ref = today()) {
  const anchor = parseDate(payPeriod.anchorDate);
  let n;
  if (payPeriod.mode === 'monthly') {
    n = (ref.getFullYear() - anchor.getFullYear()) * 12 + (ref.getMonth() - anchor.getMonth());
    if (payDateAt(payPeriod, n) > ref) n -= 1;
  } else {
    n = Math.floor((ref - anchor) / (intervalDays(payPeriod) * MS_DAY));
  }
  const current = payDateAt(payPeriod, n); // most recent pay date <= ref
  const next = payDateAt(payPeriod, n + 1);
  const previous = payDateAt(payPeriod, n - 1);
  return { index: n, previous, current, next };
}

/** Upcoming pay dates from `ref` forward. */
export function upcoming(payPeriod, count = 4, ref = today()) {
  const { index } = schedule(payPeriod, ref);
  const out = [];
  let n = index;
  while (out.length < count) {
    const d = payDateAt(payPeriod, n);
    if (d >= ref) out.push(d);
    n += 1;
    if (n > index + count + 24) break; // safety valve
  }
  return out;
}

export const daysBetween = (a, b) => Math.round((b - a) / MS_DAY);

/**
 * Status of the period whose pay date has most recently arrived or is next up.
 * Returns: { dueDate, key, paid, paidRecord, daysUntil, state }
 * state: 'paid' | 'overdue' | 'due-today' | 'upcoming'
 */
export function currentPeriodStatus(payPeriod, paidPeriods = {}, ref = today()) {
  const { current, next } = schedule(payPeriod, ref);
  const currentKey = periodKey(current);
  // Once the arrived period is settled, attention moves to the next one.
  const settled = Boolean(paidPeriods[currentKey]);
  const dueDate = settled ? next : current;
  const key = periodKey(dueDate);
  const paidRecord = paidPeriods[key] || null;
  const daysUntil = daysBetween(ref, dueDate);
  let state;
  if (paidRecord) state = 'paid';
  else if (daysUntil < 0) state = 'overdue';
  else if (daysUntil === 0) state = 'due-today';
  else state = 'upcoming';
  return { dueDate, key, paid: Boolean(paidRecord), paidRecord, daysUntil, state, nextDate: next };
}

export function describePeriod(payPeriod) {
  switch (payPeriod.mode) {
    case 'weekly':
      return 'Every week';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return `Monthly on the ${ordinal(parseDate(payPeriod.anchorDate).getDate())}`;
    default:
      return `Every ${intervalDays(payPeriod)} days`;
  }
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const fmtDate = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, opts).format(d);

export function relativeDays(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
