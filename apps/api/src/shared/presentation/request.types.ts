import type { Request } from 'express';

export interface StoreContext {
  id: string;
  slug: string;
  name: string;
  currency: string;
  status: string;
}

export interface AuthContext {
  type: 'user' | 'customer';
  subjectId: string;
  storeId: string;
  permissions: string[];
}

export interface AppRequest extends Request {
  auth?: AuthContext;
  store?: StoreContext;
  rawBody?: Buffer;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  typ: 'user' | 'customer' | 'mfa';
  perms?: string[];
  iat?: number;
  exp?: number;
}
