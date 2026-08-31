import { RepositoriesProvider, createQueryClient } from '@shop/state';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app';
import './index.css';
import { repositories } from './lib/repositories';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepositoriesProvider repositories={repositories}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </RepositoriesProvider>
  </StrictMode>,
);
