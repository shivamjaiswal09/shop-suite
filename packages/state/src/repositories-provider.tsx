import type { Repositories } from '@shop/data';
import { createContext, useContext, type ReactNode } from 'react';

const RepositoriesContext = createContext<Repositories | null>(null);

export interface RepositoriesProviderProps {
  repositories: Repositories;
  children: ReactNode;
}

/**
 * The single injection point for data access. Screens never import a concrete
 * repository — swapping `createMockRepositories()` here for an HTTP
 * implementation is the whole migration.
 */
export function RepositoriesProvider({ repositories, children }: RepositoriesProviderProps) {
  return <RepositoriesContext.Provider value={repositories}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) throw new Error('useRepositories must be used inside <RepositoriesProvider>');
  return repositories;
}
