# TaxHelper

Log the hours you work, prove you were paid the right amount, and keep enough
aside for taxes.

Built for gig/freelance work (Handshake shifts, one-off clients, tips).

Works two ways, both free:

- **Local only** (default) — everything stays in your browser. No account, no
  network, nothing uploaded.
- **With an account** — sign in and your shifts, ledger, and proof files follow
  you across phone and laptop. Runs on Supabase's free tier; there is no server
  to run or pay for. See [DEPLOY.md](DEPLOY.md).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 39 assertions, no test framework needed
npm run build && npm run preview
```

## What it does

**Work log — the proof layer.** Log a shift the day you work it: date, employer,
clock in/out (hours are calculated for you, breaks deducted, overnight shifts
handled), and your rate. The app tells you what you're owed. When money lands you
record *the amount that actually arrived*, and any gap becomes a flagged
`Underpaid` shift with the exact difference. Shifts with nothing logged after 14
days flip to `Unpaid`.

Attach screenshots and photos to any shift — the gig posting, the schedule, texts,
a pay stub. **Copy the receipts** puts a dated, itemized summary of every unpaid
and underpaid shift on your clipboard, ready to paste into an email. **Export CSV**
gives you the whole log as a file.

**Ledger & taxes.** Income and expenses, sortable and searchable. Paid shifts post
themselves into the ledger as income, so you don't enter anything twice. A reserve
rate slider recalculates estimated tax live, and a progress bar tracks what you've
*actually* moved into savings against what you should have.

**Pay periods.** Define weekly / biweekly / monthly / custom, see the next expected
pay date, and mark each period received (short payments are flagged there too).

**Reminders.** Browser notifications before payday, when a payment is late, and
when the tax reserve falls behind. Installable as a PWA and works offline.

## Installing it as an app

TaxHelper is a PWA, so it installs as a real application on every platform —
no store, no installer, no cost. It runs in its own window, gets a proper icon,
and **works fully offline** (the whole app is precached at build time).

| Platform | How |
|---|---|
| **Windows / macOS desktop** | Open in Chrome or Edge → install icon in the address bar (a monitor with ↓), or ⋮ → *Cast, save, and share* → *Install page as app*. You get a Start-menu / Applications entry and a pinnable taskbar or dock icon. |
| **Android** | Chrome → ⋮ → *Add to Home screen*. Gets an app icon, its own window, and notifications. |
| **iPhone / iPad** | Safari → Share → *Add to Home Screen*. Required for notifications to work at all on iOS — an Apple restriction, not a limitation here. |

You can try it before deploying: `npm run build && npm run preview` and install
from `http://127.0.0.1:4173`. Localhost counts as a secure context, so the
install prompt and the service worker both work.

Updates arrive on their own: redeploy, and the next launch picks up the new
build (the cache name is a content hash, so stale caches are dropped).

A packaged `.exe` / `.msi` is possible too — Tauri would produce roughly a 5 MB
installer using the WebView2 runtime Windows already ships — but it needs the
Rust toolchain and has to be rebuilt by hand for every update. The PWA install
is the same app with none of that overhead.

## Architecture

```
src/
  data/        db.js          IndexedDB wrapper (no dependencies)
               repository.js  THE data interface — every method async, plain JSON
               sync.js        local-first sync engine (outbox, tombstones, LWW)
               supabase.js    client; absent env vars = local-only mode
               files.js       magic-byte attachment validation
  domain/      tax.js         reserve maths
               payPeriods.js  schedule maths (local-noon dates, DST-safe)
               work.js        reconciliation: owed vs. received
               aggregate.js   chart series
  hooks/       useStore.jsx   one context, all state + persistence
               useAuth.jsx    session, sign in/up/out, sync scheduling
               useNotifications.js
  components/  Dashboard · WorkLog · ShiftForm · ShiftList · Attachments · Account
               OwedBanner · EntryForm · EntryList · PayPeriodCard
               ReserveProgress · SummaryCards · Settings · charts/
  styles/      theme.css (design tokens) · app.css (layout)
```

**Sync is local-first.** IndexedDB stays the source of truth for reads, so the app
is fully usable offline and signed out. On top of that: writes go to a local
outbox, flushed when the network returns; pulls merge rows changed since a cursor;
conflicts resolve last-write-wins on a *server-set* `updated_at`; deletes are
tombstones, because a hard delete is indistinguishable from "this device hasn't
seen it yet" and would resurrect on the next pull.

Nothing outside `data/` knows how persistence works — no component imports
`db.js` or `supabase.js`. That is why adding accounts touched the data layer and
one new card, and left every other component alone.

`domain/` is pure functions: no React, no storage, no dates-from-strings ambiguity.
That's what the test script exercises.

### Design

A ledger book, not a SaaS dashboard: ruled-paper background, ink-green rules,
Fraunces for display type, and **IBM Plex Mono with tabular figures for every
number** so columns of amounts align. Light and dark are separately chosen
palettes, both driven off `data-theme` plus `prefers-color-scheme`.

Chart colors are a validated categorical palette (checked for colorblind
separation, lightness band, chroma, and contrast). Category breakdown is
horizontal bars rather than a pie — bars compare magnitudes accurately, carry
direct value labels, and fold a long tail into "Other" instead of inventing hues.

## Notifications: the honest trade-off

**What works now, with no backend and no paid service:**

- Notifications fire while the app is open, and when you reopen it (on mount, on
  tab focus, hourly). Each reason fires at most once per day.
- Installed as a PWA on Android, the service worker can display notifications
  outside the tab.
- Fully offline-capable, installable, free.

**The limit:** a service worker cannot wake itself on a schedule. A `push` event
only fires when *a server sends one*. So if you never open the app for a week,
nothing reminds you. **iOS is stricter** — web push requires the app be added to
the Home Screen, and there is no background scheduling at all.

For reminders that arrive whether or not you open the app, you need a push
backend. The handler is already written (`public/sw.js` listens for `push` and
`notificationclick`) — only the server side is missing. Options:

| Option | Cost | Effort | Notes |
|---|---|---|---|
| **`web-push` on a small Node server** *(recommended)* | free tier on Fly/Render/Railway | ~half a day | You own the VAPID keys and the data. Store subscriptions + each user's pay schedule, run a cron that pushes. No third party sees your finances. |
| **OneSignal / Firebase Cloud Messaging** | free tier, paid above it | ~2 hours | Faster, but your device token and schedule live on their servers, and it adds an SDK. |
| **Calendar export (.ics)** | free | ~1 hour | Not a notification system, but pay dates in your phone's calendar get you native alerts with zero infrastructure. A decent middle option. |

**I have not built any of these** — you asked to be consulted first. Say the word
and I'd go with `web-push` on a tiny Node server: it keeps everything free, keeps
your income data off third-party infrastructure, and reuses the service worker
that's already here.

## Security

Full detail in [DEPLOY.md](DEPLOY.md#what-is-protecting-your-data). The short list:

- **Row Level Security on every table.** The Supabase anon key is public by
  design — it ships in the bundle. RLS is what makes that safe, and the schema
  enables it on all four tables with `WITH CHECK` on every write.
- **Proof files live in a private bucket**, namespaced by user id, served only
  through 60-second signed URLs.
- **A strict CSP** (`vercel.json`) restricts scripts to same-origin and blocks
  framing, plugins, and `base` hijacking. Plus HSTS, `nosniff`, `frame-ancestors
  'none'`, and a locked-down `Permissions-Policy`.
- **Uploads are validated by magic bytes, not by their claimed type.** SVG and
  HTML are rejected: a `blob:` URL inherits the app's origin, so opening an
  uploaded SVG would run script able to read your session. `test/security.test.mjs`
  covers this.
- **`updated_at` is set by a database trigger**, so a tampered client cannot
  claim a future timestamp and win every sync conflict.
- Passwords, hashing, rate limiting, and email confirmation are Supabase Auth's
  job — deliberately not reimplemented here.

Known trade-off: the session token sits in localStorage because an httpOnly
cookie requires a server. That is standard for serverless SPAs and is safe so
long as no attacker script runs on the origin — which is what the CSP enforces.

## Your data

IndexedDB, with a localStorage fallback for private browsing. Signed in, it also
lives in your Supabase project. Clearing site data wipes the local copy.
**Export a backup** from Settings before switching phones, and keep one at tax
time.

Estimates only — not tax advice. Self-employment tax alone is ~15.3%; most
freelancers reserve 25–30% once income tax is counted.

## Deploying

Vercel + Supabase, both free tiers, no card, no server:
**[DEPLOY.md](DEPLOY.md)**.

## GitHub

The repo is initialized and committed locally. To push it (private):

```bash
gh repo create taxhelper --private --source=. --remote=origin --push
```

Or without the `gh` CLI: create an empty **private** repo on github.com, then

```bash
git remote add origin https://github.com/<you>/taxhelper.git
git push -u origin main
```

`.gitignore` already excludes `.env*` (except the example), `node_modules/`,
`dist/`, and `.vercel/`. No secret is committed — and the anon key is not a
secret anyway.

## Tests

```bash
npm test
```

39 assertions, no framework. `domain.test.mjs` covers the pay-period schedule
(including the Jan-31 → Feb-28 monthly clamp and DST safety), reconciliation
states, reserve maths, and chart aggregation. `security.test.mjs` covers the
attachment boundary: format allowlisting by magic bytes, scriptable-file
rejection, size limits, and filename sanitization.
