import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  requestId: string;
  ip?: string;
  userAgent?: string;
  storeId?: string;
  actorType?: 'USER' | 'CUSTOMER' | 'SYSTEM' | 'INTEGRATION';
  actorId?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  set(patch: Partial<RequestContextData>): void {
    const current = storage.getStore();
    if (current) Object.assign(current, patch);
  },
};
