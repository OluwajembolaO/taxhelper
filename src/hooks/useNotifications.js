import { useCallback, useEffect, useState } from 'react';
import { currentPeriodStatus, today, toISO } from '../domain/payPeriods.js';
import { reserveStatus } from '../domain/tax.js';
import { useStore } from './useStore.jsx';

const supported = typeof window !== 'undefined' && 'Notification' in window;

/**
 * Local (client-scheduled) notifications. Fires through the service worker
 * registration when one is active so the alert survives on mobile; falls back
 * to `new Notification()` on desktop. Each reason fires at most once per day,
 * tracked in settings.notify.lastFired.
 */
export function useNotifications() {
  const { settings, updateSettings, entries, paidPeriods } = useStore();
  const [permission, setPermission] = useState(supported ? Notification.permission : 'unsupported');

  const request = useCallback(async () => {
    if (!supported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') updateSettings((s) => ({ ...s, notify: { ...s.notify, enabled: true } }));
    return result;
  }, [updateSettings]);

  const show = useCallback(async (title, body, tag) => {
    if (!supported || Notification.permission !== 'granted') return false;
    const options = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' };
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }, []);

  const checkNow = useCallback(async () => {
    if (!supported || Notification.permission !== 'granted' || !settings.notify.enabled) return;
    const stamp = toISO(today());
    const fired = { ...(settings.notify.lastFired || {}) };
    const period = currentPeriodStatus(settings.payPeriod, paidPeriods);
    const { shortfall } = reserveStatus(entries, settings.taxRate, settings.setAside);
    const pending = [];

    if (period.state === 'overdue') {
      pending.push(['payday-overdue', 'Payment overdue', `Expected pay was ${Math.abs(period.daysUntil)} day(s) ago and is not marked received.`]);
    } else if (period.state === 'due-today') {
      pending.push(['payday-today', 'Payday is today', 'Mark it received once the money lands.']);
    } else if (period.daysUntil > 0 && period.daysUntil <= (settings.notify.leadDays ?? 2)) {
      pending.push(['payday-soon', 'Payday coming up', `Next expected pay is in ${period.daysUntil} day(s).`]);
    }

    if (shortfall > 0.5) {
      pending.push([
        'reserve-shortfall',
        'Time to top up your tax reserve',
        `You are ${shortfall.toFixed(2)} short of your reserve target.`,
      ]);
    }

    let changed = false;
    for (const [reason, title, body] of pending) {
      if (fired[reason] === stamp) continue;
      if (await show(title, body, reason)) {
        fired[reason] = stamp;
        changed = true;
      }
    }
    if (changed) updateSettings((s) => ({ ...s, notify: { ...s.notify, lastFired: fired } }));
  }, [settings, entries, paidPeriods, show, updateSettings]);

  // Check on mount, whenever the tab regains focus, and hourly.
  useEffect(() => {
    checkNow();
    const onVisible = () => document.visibilityState === 'visible' && checkNow();
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(checkNow, 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [checkNow]);

  return { supported, permission, request, show, checkNow };
}
