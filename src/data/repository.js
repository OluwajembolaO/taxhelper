// The app's ONLY data interface. Swap the driver below for an HTTP client and
// nothing in the UI changes: every method is async and returns plain JSON.
import { idb, isSupported, STORE_ENTRIES, STORE_KV, STORE_SHIFTS, STORE_FILES } from './db.js';
import { enqueue } from './sync.js';
import { supabase, syncConfigured } from './supabase.js';
import { validateFile } from './files.js';

/** Current user id, or null when signed out / sync not configured. */
async function currentUserId() {
  if (!syncConfigured) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

const KEY_SETTINGS = 'settings';
const KEY_PAID = 'paidPeriods';

export const DEFAULT_SETTINGS = {
  taxRate: 0.25, // fraction of net income to reserve
  setAside: 0, // how much you have actually moved to the reserve account
  payPeriod: {
    mode: 'biweekly', // weekly | biweekly | monthly | custom
    anchorDate: new Date().toISOString().slice(0, 10),
    intervalDays: 14, // used when mode === 'custom'
    expectedAmount: 0,
  },
  notify: { enabled: false, leadDays: 2, lastFired: {} },
  work: {
    defaultRate: 0, // $/hour, prefilled on new shifts
    defaultEmployer: '', // e.g. the Handshake gig you work most
    autoIncome: true, // paid shifts post to the ledger as income automatically
  },
};

// --- localStorage fallback driver (private browsing / no IDB) --------------
const ls = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem('taxhelper:' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem('taxhelper:' + key, JSON.stringify(value));
    } catch {
      /* quota / disabled — data stays in memory for the session */
    }
  },
};

const useIdb = isSupported;

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export function normalizeEntry(input) {
  return {
    id: input.id ?? newId(),
    date: input.date, // 'YYYY-MM-DD'
    amount: Math.abs(Number(input.amount) || 0),
    type: input.type === 'expense' ? 'expense' : 'income',
    category: (input.category || '').trim() || 'Uncategorized',
    note: (input.note || '').trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}


export function normalizeShift(input) {
  const hours = Math.max(0, Number(input.hours) || 0);
  const rate = Math.max(0, Number(input.rate) || 0);
  const flat = input.flatAmount == null || input.flatAmount === '' ? null : Math.abs(Number(input.flatAmount) || 0);
  return {
    id: input.id ?? newId(),
    date: input.date, // 'YYYY-MM-DD' — the day worked
    employer: (input.employer || '').trim() || 'Unspecified',
    role: (input.role || '').trim(),
    hours,
    rate,
    flatAmount: flat, // set for flat-fee gigs; overrides hours × rate
    expected: flat != null ? flat : Math.round(hours * rate * 100) / 100,
    startTime: input.startTime || '',
    endTime: input.endTime || '',
    note: (input.note || '').trim(),
    // reconciliation
    paidAmount: input.paidAmount == null || input.paidAmount === '' ? null : Number(input.paidAmount),
    paidDate: input.paidDate || null,
    disputed: Boolean(input.disputed),
    // proof
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    entryId: input.entryId ?? null, // ledger income entry created for this shift
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const repository = {
  // --- entries ---
  async listEntries() {
    const rows = useIdb ? await idb.getAll(STORE_ENTRIES) : ls.read('entries', []);
    return rows
      .filter((e) => !e.deleted)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },

  async saveEntry(input) {
    const entry = normalizeEntry(input);
    if (useIdb) {
      await idb.put(STORE_ENTRIES, entry);
    } else {
      const rows = ls.read('entries', []).filter((e) => e.id !== entry.id);
      rows.push(entry);
      ls.write('entries', rows);
    }
    await enqueue('entries', entry);
    return entry;
  },

  // Deletes are tombstones, not removals — see sync.js for why.
  async deleteEntry(id) {
    const existing = useIdb
      ? await idb.get(STORE_ENTRIES, id)
      : ls.read('entries', []).find((e) => e.id === id);
    if (!existing) return;
    const tomb = { ...existing, deleted: true, updatedAt: new Date().toISOString() };
    if (useIdb) await idb.put(STORE_ENTRIES, tomb);
    else ls.write('entries', ls.read('entries', []).map((e) => (e.id === id ? tomb : e)));
    await enqueue('entries', tomb);
  },

  // --- settings ---
  async getSettings() {
    const stored = useIdb ? await idb.get(STORE_KV, KEY_SETTINGS) : ls.read(KEY_SETTINGS, null);
    return {
      ...DEFAULT_SETTINGS,
      ...(stored || {}),
      payPeriod: { ...DEFAULT_SETTINGS.payPeriod, ...(stored?.payPeriod || {}) },
      notify: { ...DEFAULT_SETTINGS.notify, ...(stored?.notify || {}) },
    };
  },

  async saveSettings(settings) {
    if (useIdb) await idb.put(STORE_KV, settings, KEY_SETTINGS);
    else ls.write(KEY_SETTINGS, settings);
    return settings;
  },

  // --- pay-period receipts: { [periodKey]: { paidAt, amount } } ---
  async getPaidPeriods() {
    return (useIdb ? await idb.get(STORE_KV, KEY_PAID) : ls.read(KEY_PAID, null)) || {};
  },

  async savePaidPeriods(map) {
    if (useIdb) await idb.put(STORE_KV, map, KEY_PAID);
    else ls.write(KEY_PAID, map);
    return map;
  },


  // --- work log (shifts) ---
  async listShifts() {
    const rows = useIdb ? await idb.getAll(STORE_SHIFTS) : ls.read('shifts', []);
    return rows
      .filter((s) => !s.deleted)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },

  async saveShift(input) {
    const shift = normalizeShift(input);
    if (useIdb) {
      await idb.put(STORE_SHIFTS, shift);
    } else {
      const rows = ls.read('shifts', []).filter((s) => s.id !== shift.id);
      rows.push(shift);
      ls.write('shifts', rows);
    }
    await enqueue('shifts', shift);
    return shift;
  },

  async deleteShift(id) {
    const existing = useIdb
      ? await idb.get(STORE_SHIFTS, id)
      : ls.read('shifts', []).find((s) => s.id === id);
    if (!existing) return;
    const tomb = { ...existing, deleted: true, updatedAt: new Date().toISOString() };
    if (useIdb) await idb.put(STORE_SHIFTS, tomb);
    else ls.write('shifts', ls.read('shifts', []).map((s) => (s.id === id ? tomb : s)));
    await enqueue('shifts', tomb);
  },

  // --- proof attachments -------------------------------------------------
  // Every file is validated by magic bytes BEFORE it is stored (see files.js).
  // Signed in, the bytes go to a private Supabase bucket at "<uid>/<id>" and are
  // read back through short-lived signed URLs; signed out, they stay in
  // IndexedDB as Blobs. Either way nothing is ever public.
  async saveAttachment(file) {
    const check = await validateFile(file);
    if (!check.ok) throw new Error(check.reason);

    const id = newId();
    const meta = {
      id,
      name: check.name,
      type: check.type, // the SNIFFED type, not the browser's claim
      size: file.size,
      addedAt: new Date().toISOString(),
      remote: false,
    };

    const userId = await currentUserId();
    if (userId) {
      const { error } = await supabase.storage
        .from('proof')
        .upload(`${userId}/${id}`, file, { contentType: check.type, upsert: false });
      if (!error) meta.remote = true;
      else console.warn('[proof] upload failed, keeping a local copy:', error.message);
    }

    // Always keep a local copy: it is what makes the app work offline, and it
    // means an upload failure never loses your evidence.
    if (useIdb) {
      await idb.put(STORE_FILES, file, id);
    } else if (!meta.remote) {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      ls.write('file:' + id, dataUrl);
    }
    return meta;
  },

  async getAttachmentUrl(id) {
    if (useIdb) {
      const blob = await idb.get(STORE_FILES, id);
      if (blob) return URL.createObjectURL(blob);
    } else {
      const local = ls.read('file:' + id, null);
      if (local) return local;
    }
    // Not on this device — fetch it from storage with a 60-second signed URL.
    const userId = await currentUserId();
    if (!userId) return null;
    const { data, error } = await supabase.storage
      .from('proof')
      .createSignedUrl(`${userId}/${id}`, 60);
    return error ? null : data.signedUrl;
  },

  async deleteAttachment(id) {
    if (useIdb) await idb.del(STORE_FILES, id);
    else {
      try {
        localStorage.removeItem('taxhelper:file:' + id);
      } catch {
        /* ignore */
      }
    }
    const userId = await currentUserId();
    if (userId) await supabase.storage.from('proof').remove([`${userId}/${id}`]);
  },

  // --- bulk ---
  async exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: await this.listEntries(),
      shifts: await this.listShifts(),
      settings: await this.getSettings(),
      paidPeriods: await this.getPaidPeriods(),
    };
  },

  async importAll(data) {
    if (useIdb) await idb.clear(STORE_ENTRIES);
    else ls.write('entries', []);
    for (const e of data.entries || []) await this.saveEntry(e);
    if (useIdb) await idb.clear(STORE_SHIFTS);
    else ls.write('shifts', []);
    for (const sh of data.shifts || []) await this.saveShift(sh);
    if (data.settings) await this.saveSettings(data.settings);
    if (data.paidPeriods) await this.savePaidPeriods(data.paidPeriods);
  },
};
