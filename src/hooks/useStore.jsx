import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { repository, DEFAULT_SETTINGS } from '../data/repository.js';
import { periodKey } from '../domain/payPeriods.js';

const StoreContext = createContext(null);

/** Lets AuthProvider (mounted inside StoreProvider) trigger a re-read after sync. */
export const storeReloadBridge = { reload: null };

const sortEntries = (list) =>
  list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export function StoreProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [paidPeriods, setPaidPeriods] = useState({});
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [e, s, p, w] = await Promise.all([
        repository.listEntries(),
        repository.getSettings(),
        repository.getPaidPeriods(),
        repository.listShifts(),
      ]);
      if (cancelled) return;
      setEntries(e);
      setSettings(s);
      setPaidPeriods(p);
      setShifts(w);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refs let the shift actions read current state without re-creating callbacks.
  const shiftsRef = useRef(shifts);
  const settingsRef = useRef(settings);
  useEffect(() => {
    shiftsRef.current = shifts;
  }, [shifts]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const saveEntry = useCallback(async (input) => {
    const saved = await repository.saveEntry(input);
    setEntries((prev) => sortEntries([saved, ...prev.filter((e) => e.id !== saved.id)]));
    return saved;
  }, []);

  const deleteEntry = useCallback(async (id) => {
    await repository.deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);


  const sortShifts = (list) =>
    list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  /**
   * Saving a shift keeps the ledger in sync: once a shift has a paid amount and
   * `work.autoIncome` is on, it owns exactly one income entry, created, updated,
   * or removed to match. The link is the shift's `entryId`.
   */
  const saveShift = useCallback(
    async (input) => {
      let shift = await repository.saveShift(input);
      const autoIncome = settingsRef.current?.work?.autoIncome !== false;
      const hasPayment = shift.paidAmount != null && shift.paidAmount > 0;

      if (autoIncome && hasPayment) {
        const entry = await repository.saveEntry({
          id: shift.entryId ?? undefined,
          date: shift.paidDate || shift.date,
          amount: shift.paidAmount,
          type: 'income',
          category: shift.employer,
          note: `Shift ${shift.date}${shift.role ? ` — ${shift.role}` : ''}${shift.hours ? ` (${shift.hours}h)` : ''}`,
        });
        if (entry.id !== shift.entryId) shift = await repository.saveShift({ ...shift, entryId: entry.id });
        setEntries((prev) =>
          sortEntries([entry, ...prev.filter((e) => e.id !== entry.id)])
        );
      } else if (shift.entryId) {
        // Payment was removed (or auto-income turned off): retract the entry.
        const staleId = shift.entryId;
        await repository.deleteEntry(staleId);
        shift = await repository.saveShift({ ...shift, entryId: null });
        setEntries((prev) => prev.filter((e) => e.id !== staleId));
      }

      setShifts((prev) => sortShifts([shift, ...prev.filter((s) => s.id !== shift.id)]));
      return shift;
    },
    []
  );

  const deleteShift = useCallback(async (id) => {
    const shift = shiftsRef.current.find((s) => s.id === id);
    if (shift?.entryId) {
      await repository.deleteEntry(shift.entryId);
      setEntries((prev) => prev.filter((e) => e.id !== shift.entryId));
    }
    for (const a of shift?.attachments || []) await repository.deleteAttachment(a.id);
    await repository.deleteShift(id);
    setShifts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addAttachment = useCallback(async (shiftId, file) => {
    const meta = await repository.saveAttachment(file);
    const shift = shiftsRef.current.find((s) => s.id === shiftId);
    if (!shift) return null;
    const updated = await repository.saveShift({
      ...shift,
      attachments: [...(shift.attachments || []), meta],
    });
    setShifts((prev) => sortShifts([updated, ...prev.filter((s) => s.id !== updated.id)]));
    return meta;
  }, []);

  const removeAttachment = useCallback(async (shiftId, attachmentId) => {
    const shift = shiftsRef.current.find((s) => s.id === shiftId);
    if (!shift) return;
    await repository.deleteAttachment(attachmentId);
    const updated = await repository.saveShift({
      ...shift,
      attachments: (shift.attachments || []).filter((a) => a.id !== attachmentId),
    });
    setShifts((prev) => sortShifts([updated, ...prev.filter((s) => s.id !== updated.id)]));
  }, []);

  const updateSettings = useCallback(async (patch) => {
    setSettings((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      repository.saveSettings(next);
      return next;
    });
  }, []);

  const markPeriodPaid = useCallback(async (date, amount) => {
    setPaidPeriods((prev) => {
      const key = periodKey(date);
      const next = { ...prev, [key]: { paidAt: new Date().toISOString(), amount: Number(amount) || 0 } };
      repository.savePaidPeriods(next);
      return next;
    });
  }, []);

  const unmarkPeriodPaid = useCallback(async (date) => {
    setPaidPeriods((prev) => {
      const next = { ...prev };
      delete next[periodKey(date)];
      repository.savePaidPeriods(next);
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    setEntries(await repository.listEntries());
    setSettings(await repository.getSettings());
    setPaidPeriods(await repository.getPaidPeriods());
    setShifts(await repository.listShifts());
  }, []);

  useEffect(() => {
    storeReloadBridge.reload = reload;
    return () => {
      storeReloadBridge.reload = null;
    };
  }, [reload]);

  const value = useMemo(
    () => ({
      entries,
      settings,
      paidPeriods,
      shifts,
      loading,
      saveEntry,
      deleteEntry,
      saveShift,
      deleteShift,
      addAttachment,
      removeAttachment,
      updateSettings,
      markPeriodPaid,
      unmarkPeriodPaid,
      repository,
      reload,
    }),
    [entries, settings, paidPeriods, shifts, loading, saveEntry, deleteEntry, saveShift, deleteShift,
     addAttachment, removeAttachment, updateSettings, markPeriodPaid, unmarkPeriodPaid, reload]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
