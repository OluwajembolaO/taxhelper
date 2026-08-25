// Renders the app and saves screenshots, so design work is based on what the
// UI actually looks like rather than what the code implies it looks like.
//
//   npm run shots            desktop + mobile, light + dark
//   npm run shots -- --dark  just dark
//
// Seeds realistic gig-work data directly into IndexedDB first — empty states
// hide every layout problem worth finding.

import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4173';
const OUT = 'screenshots';

// ─── demo data ─────────────────────────────────────────────────────────────
const iso = (daysAgo) => {
  const d = new Date('2026-08-25T12:00:00');
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

const shift = (o) => ({
  role: '',
  hours: 0,
  rate: 0,
  flatAmount: null,
  startTime: '',
  endTime: '',
  breakMins: 0,
  note: '',
  paidAmount: null,
  paidDate: null,
  disputed: false,
  attachments: [],
  entryId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
  ...o,
});

const SHIFTS = [
  shift({ id: 's1', date: iso(2), employer: 'Handshake', role: 'Event setup', hours: 6, rate: 22, expected: 132, startTime: '08:00', endTime: '14:30', breakMins: 30 }),
  shift({ id: 's2', date: iso(5), employer: 'Handshake', role: 'Catering', hours: 5.5, rate: 22, expected: 121, paidAmount: 99, paidDate: iso(1), note: 'Paid for 4.5h, worked 5.5h' }),
  shift({ id: 's3', date: iso(9), employer: 'Handshake', role: 'Event setup', hours: 8, rate: 22, expected: 176, paidAmount: 176, paidDate: iso(3) }),
  shift({ id: 's4', date: iso(21), employer: 'Campus Rec', role: 'Front desk', hours: 4, rate: 18, expected: 72 }),
  shift({ id: 's5', date: iso(28), employer: 'Handshake', role: 'Move-in crew', hours: 7, rate: 22, expected: 154, paidAmount: 154, paidDate: iso(20) }),
  shift({ id: 's6', date: iso(35), employer: 'Bright Tutoring', role: 'Tutoring', hours: 3, rate: 30, expected: 90, paidAmount: 90, paidDate: iso(30) }),
  shift({ id: 's7', date: iso(44), employer: 'Handshake', role: 'Warehouse', hours: 9, rate: 20, expected: 180, paidAmount: 180, paidDate: iso(38) }),
  shift({ id: 's8', date: iso(58), employer: 'Campus Rec', role: 'Front desk', hours: 6, rate: 18, expected: 108, paidAmount: 108, paidDate: iso(52) }),
];

const entry = (id, date, amount, type, category, note = '') => ({
  id, date, amount, type, category, note,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deleted: false,
});

const ENTRIES = [
  entry('e1', iso(1), 99, 'income', 'Handshake', 'Shift ' + iso(5) + ' — Catering (5.5h)'),
  entry('e2', iso(3), 176, 'income', 'Handshake', 'Shift ' + iso(9) + ' — Event setup (8h)'),
  entry('e3', iso(20), 154, 'income', 'Handshake', 'Shift ' + iso(28) + ' — Move-in crew (7h)'),
  entry('e4', iso(30), 90, 'income', 'Bright Tutoring', 'Shift ' + iso(35) + ' — Tutoring (3h)'),
  entry('e5', iso(38), 180, 'income', 'Handshake', 'Shift ' + iso(44) + ' — Warehouse (9h)'),
  entry('e6', iso(52), 108, 'income', 'Campus Rec', 'Shift ' + iso(58) + ' — Front desk (6h)'),
  entry('e7', iso(4), 42.5, 'expense', 'Transport', 'Gas to the venue'),
  entry('e8', iso(12), 18.99, 'expense', 'Phone / internet', 'Data top-up'),
  entry('e9', iso(19), 64, 'expense', 'Equipment', 'Non-slip work shoes'),
  entry('e10', iso(26), 12.5, 'expense', 'Meals', 'Double shift, no break'),
  entry('e11', iso(33), 31, 'expense', 'Supplies', 'Black polo for catering'),
  entry('e12', iso(47), 24.99, 'expense', 'Software', 'Scheduling app'),
];

const SETTINGS = {
  taxRate: 0.25,
  setAside: 120,
  payPeriod: { mode: 'biweekly', anchorDate: iso(53), intervalDays: 14, expectedAmount: 260 },
  notify: { enabled: false, leadDays: 2, lastFired: {} },
  work: { defaultRate: 22, defaultEmployer: 'Handshake', autoIncome: true },
};

// ─── seeding (runs inside the page, before the app boots) ──────────────────
async function seed(page) {
  await page.addInitScript(
    ({ shifts, entries, settings }) =>
      new Promise((resolve) => {
        const req = indexedDB.open('taxhelper', 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries'))
            db.createObjectStore('entries', { keyPath: 'id' }).createIndex('date', 'date');
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('shifts'))
            db.createObjectStore('shifts', { keyPath: 'id' }).createIndex('date', 'date');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['entries', 'shifts', 'kv'], 'readwrite');
          for (const s of shifts) tx.objectStore('shifts').put(s);
          for (const e of entries) tx.objectStore('entries').put(e);
          tx.objectStore('kv').put(settings, 'settings');
          tx.objectStore('kv').put({}, 'paidPeriods');
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        };
        req.onerror = resolve;
      }),
    { shifts: SHIFTS, entries: ENTRIES, settings: SETTINGS }
  );
}

// ─── capture ───────────────────────────────────────────────────────────────
const TABS = ['dashboard', 'work', 'ledger', 'settings'];
const TAB_LABEL = { dashboard: 'Dashboard', work: 'Work log', ledger: 'Ledger', settings: 'Settings' };

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false },
  { name: 'mobile', ...devices['iPhone 13'] },
];

const args = process.argv.slice(2);
const themes = args.includes('--dark') ? ['dark'] : args.includes('--light') ? ['light'] : ['light', 'dark'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const problems = [];

for (const vp of VIEWPORTS) {
  for (const theme of themes) {
    const context = await browser.newContext({ ...vp, colorScheme: theme, deviceScaleFactor: 2 });
    const page = await context.newPage();

    // Surface anything the app logs — console errors are design bugs too.
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`[${vp.name}/${theme}] console: ${m.text().slice(0, 160)}`);
    });
    page.on('pageerror', (e) => problems.push(`[${vp.name}/${theme}] pageerror: ${e.message.slice(0, 160)}`));

    await seed(page);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app', { timeout: 15000 });

    for (const tab of TABS) {
      await page.getByRole('button', { name: TAB_LABEL[tab], exact: false }).first().click();
      // Let charts mount and any lazy chunk settle.
      await page.waitForTimeout(900);
      const file = `${OUT}/${vp.name}-${theme}-${tab}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log('saved', file);

      // Horizontal overflow is the most common responsive break; catch it here.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 2) problems.push(`[${vp.name}/${theme}/${tab}] body scrolls horizontally by ${overflow}px`);
    }

    await context.close();
  }
}

await browser.close();

console.log('\n' + '─'.repeat(60));
if (problems.length) {
  console.log('Problems detected:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
} else {
  console.log('No console errors and no horizontal overflow.');
}
