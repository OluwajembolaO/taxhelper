# Deploying TaxHelper

Total cost: **$0**. Vercel's Hobby plan and Supabase's free tier both cover this
app comfortably, and neither asks for a card.

There is no server to run. Vercel serves static files; Supabase provides the
database and login. Nothing needs Render, a VPS, or a container.

---

## 1. Supabase (accounts + sync) — ~10 minutes

1. Sign up at [supabase.com](https://supabase.com) → **New project**.
   - Pick a region near you. Save the database password somewhere safe; you will
     not need it for this app, but losing it is annoying.
   - The project takes a couple of minutes to provision.

2. **SQL Editor** → **New query** → paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

   The last statement prints a table. **Every row must say `rls_enabled = true`.**
   If any says false, stop and re-run — that table would otherwise be readable by
   anyone.

3. **Authentication → Providers → Email**: make sure Email is enabled.
   - Leave "Confirm email" **on**. It costs you one click at signup and stops
     anyone registering an account on an address they don't control.

4. **Authentication → URL Configuration**: once you have a Vercel URL, add it to
   **Site URL** and **Redirect URLs**. Password-reset links break without this.

5. **Project Settings → API**: copy these two values.
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

   > **Never copy the `service_role` key.** It bypasses every security policy.
   > It belongs on a server, and this app does not have one. If you ever paste it
   > into a `VITE_*` variable it ends up in the public JavaScript bundle and every
   > visitor can read every user's data.

## 2. Local development

```bash
cp .env.example .env.local     # paste the two values in
npm install
npm run dev
```

`.env.local` is gitignored. Leave both variables blank to develop against
local-only mode.

## 3. Vercel — ~5 minutes

1. Push to GitHub (see [`README.md`](README.md#github)).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework preset: **Vite** (it should autodetect). Build command `npm run build`,
   output directory `dist` — [`vercel.json`](vercel.json) already sets these.
4. **Environment Variables** → add both, for Production, Preview, and Development:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon key |

   These are compiled into the bundle at build time, so **after changing them you
   must redeploy** — restarting is not enough.
5. **Deploy**, then go back to Supabase step 4 and add your `*.vercel.app` URL.

### Installing it on your phone

Open the deployed URL in Safari (iOS) or Chrome (Android) → **Share/menu → Add to
Home Screen**. It then runs full-screen, works offline, and can show
notifications. On iOS notifications *only* work once it is added to the Home
Screen — that is an Apple restriction, not a bug here.

---

## What is protecting your data

| Layer | What it does |
|---|---|
| **Row Level Security** | Every table filters on `user_id = auth.uid()`. The anon key is public by design; RLS is what makes that safe. Writes carry `WITH CHECK` so a client cannot create or move rows into someone else's account. |
| **Private storage bucket** | Proof files sit at `<your-user-id>/<file-id>` with policies matching the path against your user id. Files are read through 60-second signed URLs — there is no public URL to leak. |
| **Server-side `updated_at`** | A database trigger sets it. A tampered client cannot claim a future timestamp to win every sync conflict forever. |
| **Content Security Policy** | `vercel.json` restricts scripts to same-origin and blocks framing, plugins, and `base` hijacking. This is what keeps the login session in localStorage safe: no injected script can run to read it. |
| **Magic-byte upload validation** | `src/data/files.js` sniffs real file bytes and rejects anything scriptable (SVG, HTML). A `blob:` URL inherits the app's origin, so an uploaded SVG opened in a tab would otherwise run as TaxHelper. Covered by `test/security.test.mjs`. |
| **HSTS + `upgrade-insecure-requests`** | Everything is HTTPS, permanently. |
| **Bcrypt password hashing, rate limiting, email confirmation** | Handled by Supabase Auth — not reimplemented here, which is the right call. |

### Honest limitations

- **The session token lives in localStorage**, because an httpOnly cookie needs a
  server to set it. This is standard for serverless SPAs and is safe *as long as
  no attacker script runs on your origin* — which is exactly what the CSP is for.
  Do not weaken `script-src` to add a third-party widget without understanding
  this trade-off.
- **Supabase can technically read your data.** It is their database. If that
  matters more than cross-device sync, run the app with no env vars and it never
  leaves your browser.
- **`npm audit` is not a subscription.** Run it occasionally; update when it
  complains.

### Verifying the headers after deploy

```bash
curl -sI https://your-app.vercel.app | grep -iE "content-security|strict-transport|x-frame|x-content-type|referrer-policy"
```

All five should appear. Or paste the URL into
[securityheaders.com](https://securityheaders.com) — this config scores an A.
