import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!, {
  onCaughtError: () => {
    if (import.meta.env.DEV) console.error('A render error was handled by DealFlow.');
  },
}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
