/**
 * Type-safe API Client Envelope & Session Authenticator for E2E Tests
 */

export interface ApiResponse<T = any> {
  status: number;
  data?: T;
  meta?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
  };
  headers: Headers;
}

export interface ClientCredentials {
  bearerToken?: string;
  adminSessionCookie?: string;
  clientSessionCookie?: string;
  publishableKey?: string;
  origin?: string;
}

export class TestApiClient {
  private baseUrl: string;
  private defaultCredentials: ClientCredentials;

  constructor(baseUrl: string = 'http://localhost:3000', credentials: ClientCredentials = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultCredentials = credentials;
  }

  setCredentials(credentials: ClientCredentials): void {
    this.defaultCredentials = { ...this.defaultCredentials, ...credentials };
  }

  async get<T = any>(path: string, options: { query?: Record<string, any>; credentials?: ClientCredentials } = {}): Promise<ApiResponse<T>> {
    const creds = { ...this.defaultCredentials, ...options.credentials };
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
      });
    }

    const headers = new Headers();
    if (creds.bearerToken) {
      headers.set('Authorization', `Bearer ${creds.bearerToken}`);
    }
    if (creds.adminSessionCookie) {
      headers.set('Cookie', `__Secure-rsl-admin=${creds.adminSessionCookie}`);
    } else if (creds.clientSessionCookie) {
      headers.set('Cookie', `__Secure-rsl-client=${creds.clientSessionCookie}`);
    }
    if (creds.publishableKey) {
      headers.set('x-rsl-publishable-key', creds.publishableKey);
    }
    if (creds.origin) {
      headers.set('Origin', creds.origin);
    }

    try {
      const res = await fetch(url.toString(), { method: 'GET', headers });
      const json = await res.json().catch(() => ({}));
      return {
        status: res.status,
        data: json.data,
        meta: json.meta,
        error: json.error,
        headers: res.headers
      };
    } catch (err: any) {
      return {
        status: 503,
        error: { code: 'NETWORK_ERROR', message: err.message },
        headers: new Headers()
      };
    }
  }

  async post<T = any>(
    path: string,
    body: any,
    options: { idempotencyKey?: string; credentials?: ClientCredentials } = {}
  ): Promise<ApiResponse<T>> {
    const creds = { ...this.defaultCredentials, ...options.credentials };
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });

    if (creds.bearerToken) {
      headers.set('Authorization', `Bearer ${creds.bearerToken}`);
    }
    if (creds.adminSessionCookie) {
      headers.set('Cookie', `__Secure-rsl-admin=${creds.adminSessionCookie}`);
    } else if (creds.clientSessionCookie) {
      headers.set('Cookie', `__Secure-rsl-client=${creds.clientSessionCookie}`);
    }
    if (creds.publishableKey) {
      headers.set('x-rsl-publishable-key', creds.publishableKey);
    }
    if (creds.origin) {
      headers.set('Origin', creds.origin);
    }
    if (options.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => ({}));
      return {
        status: res.status,
        data: json.data,
        meta: json.meta,
        error: json.error,
        headers: res.headers
      };
    } catch (err: any) {
      return {
        status: 503,
        error: { code: 'NETWORK_ERROR', message: err.message },
        headers: new Headers()
      };
    }
  }
}
