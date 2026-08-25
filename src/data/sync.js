// Local-first sync.
//
// IndexedDB stays the source of truth for reads, so the app is fully usable
// offline and signed out — exactly as it was before accounts existed. Sync is a
// background reconciliation on top:
//
//   write  → local store, immediately          (UI never waits on the network)
//   push   → outbox, flushed when online
//   pull   → rows changed since the last cursor, merged by updated_at
//
// Conflicts resolve last-write-wins on the server's updated_at (a trigger sets
// it, so a client cannot claim a future timestamp to win permanently). Deletes
// are tombstones — a row is flagged `deleted`, never removed — because a hard
// delete is indistinguishable from "this device has not seen it yet" and would
// resurrect on the next pull.

import { supabase, syncConfigured } from './supabase.js';
import { idb, STORE_KV, STORE_ENTRIES, STORE_SHIFTS } from './db.js';

const CURSOR_KEY = 'syncCursor';
const OUTBOX_KEY = 'syncOutbox';
const EPOCH = '1970-01-01T00:00:00Z';

// ─── field mapping: camelCase in the app, snake_case in Postgres ───────────
const entryToRow = (e, userId) => ({
  id: e.id,
  user_id: userId,
  date: e.date,
  amount: e.amount,
  type: e.type,
  category: e.category,
  note: e.note ?? '',
  created_at: e.createdAt,
  deleted: Boolean(e.deleted),
});

const rowToEntry = (r) => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  type: r.type,
  category: r.category,
  note: r.note ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deleted: r.deleted,
});

const shiftToRow = (s, userId) => ({
  id: s.id,
  user_id: userId,
  date: s.date,
  employer: s.employer,
  role: s.role ?? '',
  hours: s.hours ?? 0,
  rate: s.rate ?? 0,
  flat_amount: s.flatAmount ?? null,
  expected: s.expected ?? 0,
  start_time: s.startTime ?? '',
  end_time: s.endTime ?? '',
  break_mins: Number(s.breakMins) || 0,
  note: s.note ?? '',
  paid_amount: s.paidAmount ?? null,
  paid_date: s.paidDate || null,
  disputed: Boolean(s.disputed),
  attachments: s.attachments ?? [],
  entry_id: s.entryId ?? null,
  created_at: s.createdAt,
  deleted: Boolean(s.deleted),
});

const rowToShift = (r) => ({
  id: r.id,
  date: r.date,
  employer: r.employer,
  role: r.role ?? '',
  hours: Number(r.hours) || 0,
  rate: Number(r.rate) || 0,
  flatAmount: r.flat_amount == null ? null : Number(r.flat_amount),
  expected: Number(r.expected) || 0,
  startTime: r.start_time ?? '',
  endTime: r.end_time ?? '',
  breakMins: r.break_mins ?? 0,
  note: r.note ?? '',
  paidAmount: r.paid_amount == null ? null : Number(r.paid_amount),
  paidDate: r.paid_date,
  disputed: r.disputed,
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
  entryId: r.entry_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deleted: r.deleted,
});

const TABLES = {
  entries: { store: STORE_ENTRIES, toRow: entryToRow, fromRow: rowToEntry },
  shifts: { store: STORE_SHIFTS, toRow: shiftToRow, fromRow: rowToShift },
};

// ─── outbox ────────────────────────────────────────────────────────────────
const readKv = async (key, fallback) => (await idb.get(STORE_KV, key)) ?? fallback;
const writeKv = (key, value) => idb.put(STORE_KV, value, key);

/** Queue a change for the server. Safe to call while offline or signed out. */
export async function enqueue(table, record) {
  if (!syncConfigured) return;
  const outbox = await readKv(OUTBOX_KEY, []);
  // One pending change per row — the newest wins, so the queue cannot grow
  // unbounded while offline.
  const next = outbox.filter((o) => !(o.table === table && o.id === record.id));
  next.push({ table, id: record.id, record, queuedAt: new Date().toISOString() });
  await writeKv(OUTBOX_KEY, next);
}

export async function outboxSize() {
  return (await readKv(OUTBOX_KEY, [])).length;
}

// ─── push / pull ───────────────────────────────────────────────────────────
async function push(userId) {
  const outbox = await readKv(OUTBOX_KEY, []);
  if (!outbox.length) return { pushed: 0 };

  const remaining = [];
  let pushed = 0;

  for (const table of Object.keys(TABLES)) {
    const batch = outbox.filter((o) => o.table === table);
    if (!batch.length) continue;
    const rows = batch.map((o) => TABLES[table].toRow(o.record, userId));
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      // Keep the batch queued and try again on the next sync.
      remaining.push(...batch);
      console.warn(`[sync] push ${table} failed:`, error.message);
    } else {
      pushed += rows.length;
    }
  }

  // Documents are small and idempotent — always send the current version.
  const settings = await idb.get(STORE_KV, 'settings');
  const paid = await idb.get(STORE_KV, 'paidPeriods');
  if (settings) {
    await supabase.from('settings').upsert({ user_id: userId, data: stripSecrets(settings) });
  }
  if (paid) await supabase.from('paid_periods').upsert({ user_id: userId, data: paid });

  await writeKv(OUTBOX_KEY, remaining);
  return { pushed };
}

/** Never send notification bookkeeping to the server; it is device-specific. */
function stripSecrets(settings) {
  const { notify, ...rest } = settings;
  const { lastFired, ...notifyRest } = notify || {};
  return { ...rest, notify: notifyRest };
}

async function pull(userId, cursor) {
  let newCursor = cursor;
  const merged = { entries: 0, shifts: 0 };

  for (const [table, spec] of Object.entries(TABLES)) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(1000);

    if (error) {
      console.warn(`[sync] pull ${table} failed:`, error.message);
      continue;
    }

    for (const row of data || []) {
      const incoming = spec.fromRow(row);
      const local = await idb.get(spec.store, incoming.id);
      // Last-write-wins on the server clock. A local row with no updatedAt
      // predates sync and always loses.
      if (!local || (incoming.updatedAt || EPOCH) >= (local.updatedAt || EPOCH)) {
        await idb.put(spec.store, incoming);
        merged[table] += 1;
      }
      if (row.updated_at > newCursor) newCursor = row.updated_at;
    }
  }

  const [{ data: s }, { data: p }] = await Promise.all([
    supabase.from('settings').select('data, updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('paid_periods').select('data, updated_at').eq('user_id', userId).maybeSingle(),
  ]);

  if (s?.data && Object.keys(s.data).length) {
    const local = (await idb.get(STORE_KV, 'settings')) || {};
    // Keep this device's notification bookkeeping, take everything else.
    await idb.put(
      STORE_KV,
      { ...s.data, notify: { ...(s.data.notify || {}), lastFired: local.notify?.lastFired || {} } },
      'settings'
    );
  }
  if (p?.data) await idb.put(STORE_KV, p.data, 'paidPeriods');

  return { merged, cursor: newCursor };
}

/**
 * One full sync round trip. Returns a summary, or null when sync is not
 * configured / nobody is signed in — callers treat that as "stay local".
 */
export async function syncNow() {
  if (!syncConfigured) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cursor = await readKv(CURSOR_KEY, EPOCH);
  const pushResult = await push(user.id);
  const pullResult = await pull(user.id, cursor);
  await writeKv(CURSOR_KEY, pullResult.cursor);

  return {
    ...pushResult,
    ...pullResult.merged,
    at: new Date().toISOString(),
    pending: await outboxSize(),
  };
}

/**
 * Signing out clears the sync cursor so the next account starts from scratch
 * rather than inheriting this one's high-water mark.
 */
export async function resetSyncState() {
  await writeKv(CURSOR_KEY, EPOCH);
  await writeKv(OUTBOX_KEY, []);
}

/**
 * First sign-in on a device that already has local data: everything local is
 * queued so it lands in the new account instead of being silently overwritten.
 */
export async function adoptLocalData() {
  if (!syncConfigured) return 0;
  const entries = await idb.getAll(STORE_ENTRIES);
  const shifts = await idb.getAll(STORE_SHIFTS);
  for (const e of entries) await enqueue('entries', e);
  for (const s of shifts) await enqueue('shifts', s);
  return entries.length + shifts.length;
}
