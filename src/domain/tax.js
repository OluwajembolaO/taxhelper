// Pure tax/reserve math. No React, no storage.

export function totals(entries) {
  let income = 0;
  let expenses = 0;
  for (const e of entries) {
    if (e.type === 'income') income += e.amount;
    else expenses += e.amount;
  }
  const net = income - expenses;
  return { income, expenses, net };
}

/** Estimated reserve = rate applied to net (never negative). */
export function estimateTax(net, taxRate) {
  return Math.max(0, net) * taxRate;
}

export function reserveStatus(entries, taxRate, setAside) {
  const { income, expenses, net } = totals(entries);
  const owed = estimateTax(net, taxRate);
  const shortfall = Math.max(0, owed - setAside);
  const pct = owed > 0 ? Math.min(1, setAside / owed) : setAside > 0 ? 1 : 0;
  return { income, expenses, net, owed, setAside, shortfall, pct, takeHome: net - owed };
}

export const fmtMoney = (n, currency = 'USD') =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

/** "1 shift" / "2 shifts" — never "shift(s)". */
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export const fmtCompact = (n) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
