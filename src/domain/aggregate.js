// Shaping ledger entries into chart-ready series.
import { parseDate } from './payPeriods.js';

const monthKey = (iso) => String(iso).slice(0, 7); // YYYY-MM

// "Jul 26" reads as the 26th of July. An apostrophe makes the year unambiguous.
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(y, m - 1, 1));
  return `${month} ’${String(y).slice(2)}`;
};

/** Continuous month series (gaps filled with zeros) of income / expenses / net. */
export function byMonth(entries) {
  if (!entries.length) return [];
  const buckets = new Map();
  for (const e of entries) {
    const k = monthKey(e.date);
    const b = buckets.get(k) || { income: 0, expenses: 0 };
    if (e.type === 'income') b.income += e.amount;
    else b.expenses += e.amount;
    buckets.set(k, b);
  }
  const keys = [...buckets.keys()].sort();
  const cursor = parseDate(keys[0] + '-01');
  const end = parseDate(keys[keys.length - 1] + '-01');
  const out = [];
  while (cursor <= end) {
    const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(k) || { income: 0, expenses: 0 };
    out.push({ key: k, label: monthLabel(k), ...b, net: b.income - b.expenses });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/** Cumulative net over time, one point per entry date. */
export function cumulativeNet(entries) {
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  let running = 0;
  const byDate = new Map();
  for (const e of sorted) {
    running += e.type === 'income' ? e.amount : -e.amount;
    byDate.set(e.date, running);
  }
  return [...byDate.entries()].map(([date, net]) => ({
    date,
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      parseDate(date)
    ),
    net,
  }));
}

/** Category totals for one entry type, largest first. */
export function byCategory(entries, type) {
  const buckets = new Map();
  for (const e of entries) {
    if (e.type !== type) continue;
    buckets.set(e.category, (buckets.get(e.category) || 0) + e.amount);
  }
  return [...buckets.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function filterByRange(entries, months) {
  if (!months) return entries;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const iso = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.date >= iso);
}
