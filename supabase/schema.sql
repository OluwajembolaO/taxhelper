-- TaxHelper database schema.
-- Run once in your Supabase project: SQL Editor → paste → Run.
--
-- SECURITY MODEL
-- The browser talks straight to Postgres with the *anon* key, which is public by
-- design (it ships in the JS bundle). The only thing standing between one user's
-- data and another's is Row Level Security. Every table below therefore:
--   1. has RLS ENABLED (without this, the anon key reads everything),
--   2. carries a user_id defaulting to auth.uid(),
--   3. has policies that compare user_id to auth.uid() for EVERY command, with
--      WITH CHECK on writes so a client cannot insert rows owned by someone else.
-- Do not add a table here without repeating all three.

-- ─── entries: the money ledger ─────────────────────────────────────────────
create table if not exists public.entries (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date        date not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  type        text not null check (type in ('income', 'expense')),
  category    text not null default 'Uncategorized',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- ─── shifts: hours worked and what was actually paid ───────────────────────
create table if not exists public.shifts (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date         date not null,
  employer     text not null default 'Unspecified',
  role         text not null default '',
  hours        numeric(8, 2) not null default 0 check (hours >= 0),
  rate         numeric(10, 2) not null default 0 check (rate >= 0),
  flat_amount  numeric(12, 2) check (flat_amount >= 0),
  expected     numeric(12, 2) not null default 0 check (expected >= 0),
  start_time   text not null default '',
  end_time     text not null default '',
  break_mins   integer not null default 0 check (break_mins >= 0),
  note         text not null default '',
  paid_amount  numeric(12, 2) check (paid_amount >= 0),
  paid_date    date,
  disputed     boolean not null default false,
  attachments  jsonb not null default '[]'::jsonb,
  entry_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

-- ─── settings & paid periods: one small JSON document each ─────────────────
create table if not exists public.settings (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.paid_periods (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sync pulls "everything changed since X", so index the sort key.
create index if not exists entries_user_updated_idx on public.entries (user_id, updated_at desc);
create index if not exists shifts_user_updated_idx  on public.shifts  (user_id, updated_at desc);

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.entries      enable row level security;
alter table public.shifts       enable row level security;
alter table public.settings     enable row level security;
alter table public.paid_periods enable row level security;

do $$
declare t text;
begin
  foreach t in array array['entries', 'shifts'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);

    execute format(
      'create policy "own_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format(
      'create policy "own_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    -- USING gates which rows you may target; WITH CHECK stops you rewriting
    -- user_id to hand a row to someone else.
    execute format(
      'create policy "own_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format(
      'create policy "own_delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;

  foreach t in array array['settings', 'paid_periods'] loop
    execute format('drop policy if exists "own_all" on public.%I', t);
    execute format(
      'create policy "own_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ─── updated_at is server-authoritative ────────────────────────────────────
-- A client could otherwise claim a far-future timestamp and permanently win
-- last-write-wins against its other devices.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entries', 'shifts', 'settings', 'paid_periods'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before insert or update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ─── Storage: proof attachments ────────────────────────────────────────────
-- Moved to supabase/storage.sql. It is a separate script because creating
-- policies on storage.objects needs table ownership that the SQL editor does
-- not always have — keeping it separate means a storage permissions error can
-- no longer abort the table setup above. Run storage.sql after this file.

-- ─── Verification ──────────────────────────────────────────────────────────
-- Every one of these must report rls_enabled = true. If any says false, stop:
-- that table is readable by anyone holding the anon key, which is everyone.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in (
  'public.entries'::regclass, 'public.shifts'::regclass,
  'public.settings'::regclass, 'public.paid_periods'::regclass
);
