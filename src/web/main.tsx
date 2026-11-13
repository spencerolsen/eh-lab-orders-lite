import './styles/base.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { createQueryClient } from './api/query-client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

// The error boundary is outermost, so a render error anywhere shows the
// fallback screen. BrowserRouter (declarative routing) is used rather than a
// data router, whose own error screen would catch route errors first.
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={createQueryClient()}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
