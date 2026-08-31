export * from './repositories';
export { InMemoryStore } from './mock/store';
export { createSeededStore } from './mock/seed';
export {
  MockRepositories,
  createMockRepositories,
  DuplicateBarcodeError,
  InsufficientStockError,
  NotFoundError,
} from './mock/repositories';
export { createHttpRepositories, type HttpConfig } from './http/client';
