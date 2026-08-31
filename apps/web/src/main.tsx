import { RepositoriesProvider, createQueryClient } from '@shop/state';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app';
import { ErrorBoundary } from './components/error-boundary';
import './index.css';
import { repositories } from './lib/repositories';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a crash in the shell's own chrome shows a message instead
        of a blank page — how the missing `storeIds` field presented. */}
    <ErrorBoundary scope="app">
      <RepositoriesProvider repositories={repositories}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </RepositoriesProvider>
    </ErrorBoundary>
  </StrictMode>,
);
