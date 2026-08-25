import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import WorkLog from './components/WorkLog.jsx';
import EntryForm from './components/EntryForm.jsx';
import EntryList from './components/EntryList.jsx';
import Settings from './components/Settings.jsx';
import { useStore } from './hooks/useStore.jsx';
import { useNotifications } from './hooks/useNotifications.js';
import { useAuth } from './hooks/useAuth.jsx';
import { reconcile } from './domain/work.js';

const TABS = [
  ['dashboard', 'Dashboard'],
  ['work', 'Work log'],
  ['ledger', 'Ledger'],
  ['settings', 'Settings'],
];

function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem('taxhelper:theme') || 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('taxhelper:theme', theme);
    } catch {
      /* storage disabled — the choice just won't persist */
    }
  }, [theme]);

  const next = { system: 'light', light: 'dark', dark: 'system' }[theme];
  const icon = { system: '◐', light: '☀', dark: '☾' }[theme];

  return (
    <button type="button" className="ghost themetoggle" onClick={() => setTheme(next)} title={`Theme: ${theme}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="visually-hidden">Switch theme (currently {theme})</span>
    </button>
  );
}

/** At-a-glance sync state, so "did that save?" is never a question. */
function SyncBadge({ onOpenSettings }) {
  const { syncConfigured, user, syncState } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!syncConfigured) return null;

  let tone = 'mute';
  let label = 'Local only';
  if (!online) {
    label = 'Offline';
  } else if (user) {
    tone = syncState.status === 'error' ? 'bad' : syncState.pending > 0 ? 'warn' : 'good';
    label =
      syncState.status === 'syncing'
        ? 'Syncing…'
        : syncState.status === 'error'
          ? 'Sync error'
          : syncState.pending > 0
            ? `${syncState.pending} pending`
            : 'Synced';
  }

  return (
    <button type="button" className={`syncbadge pill pill--${tone}`} onClick={onOpenSettings}>
      {label}
    </button>
  );
}

function LedgerPage() {
  const { entries, saveEntry, deleteEntry } = useStore();
  const [editing, setEditing] = useState(null);

  return (
    <div className="page">
      <div className="page__cols">
        <div className="page__aside">
          <EntryForm
            onSave={(e) => saveEntry(editing ? { ...editing, ...e } : e)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
          />
        </div>
        <div className="page__main">
          <EntryList entries={entries} onEdit={setEditing} onDelete={deleteEntry} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { loading, shifts } = useStore();
  const [tab, setTab] = useState('dashboard');
  useNotifications(); // schedules the local payday / reserve reminders

  const problems = reconcile(shifts).problemRows.length;

  if (loading) {
    return (
      <div className="loading">
        <p>Opening the ledger…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              ₮
            </span>
            <span className="brand__text">
              <strong>TaxHelper</strong>
              <span>hours · pay · proof · tax</span>
            </span>
          </div>
          <div className="topbar__actions">
            <SyncBadge onOpenSettings={() => setTab('settings')} />
            <ThemeToggle />
          </div>
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
              {id === 'work' && problems > 0 && (
                <span className="tabs__badge num" title={`${problems} shift(s) need chasing`}>
                  {problems}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'dashboard' && <Dashboard onGoToWork={() => setTab('work')} />}
        {tab === 'work' && <WorkLog />}
        {tab === 'ledger' && <LedgerPage />}
        {tab === 'settings' && <Settings />}
      </main>

      <footer className="foot">
        <p>
          Estimates only — not tax advice. Your data stays on this device; export a backup from Settings.
        </p>
      </footer>
    </div>
  );
}
