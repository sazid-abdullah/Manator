import React from 'react';
import ReactDOM from 'react-dom/client';
import { StoreProvider } from './store/context';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);

// Register Service Worker for PWA (offline use and installability)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((reg) => {
        // SW registered
      })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });
  });
}
