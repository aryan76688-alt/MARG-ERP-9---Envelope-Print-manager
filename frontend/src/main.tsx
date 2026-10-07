import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureInitialPartiesLoaded } from './offline/db';

// Ensure all 1,836 bundled parties are preloaded into offline storage on initial startup
ensureInitialPartiesLoaded().catch(console.warn);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
