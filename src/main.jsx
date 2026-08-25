import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider, storeReloadBridge } from './hooks/useStore.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import './styles/theme.css';
import './styles/app.css';

// Restore the saved theme before first paint so the page never flashes.
try {
  const saved = localStorage.getItem('taxhelper:theme');
  if (saved && saved !== 'system') document.documentElement.setAttribute('data-theme', saved);
} catch {
  /* storage disabled */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      {/* A completed sync merges rows straight into IndexedDB, so the store is
          told to re-read once the round trip finishes. */}
      <AuthProvider onSynced={() => storeReloadBridge.reload?.()}>
        <App />
      </AuthProvider>
    </StoreProvider>
  </StrictMode>
);

// PWA: register the service worker in production builds only, so the dev server
// is never shadowed by a stale cache.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support unavailable — the app still works */
    });
  });
}
