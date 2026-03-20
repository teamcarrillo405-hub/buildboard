/**
 * main.tsx
 * Application entry point
 */

import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Create root and render app
// Note: StrictMode disabled — dev double-mount was exhausting Windows TCP ports
// causing all category/state rails to silently return empty data.
// Re-enable in production build only (StrictMode is a no-op in prod anyway).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
