export interface SslCheckResult {
  hostname: string;
  port: number;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  validFrom: string;
  validTo: string;
  issuer: string;
  subject: string;
  sans: string[];
  protocol: string | null;
  authError: string | null;
  errorMessage?: string;
  timestamp: number;
}

export interface SslCheckOptions {
  port?: number;
  timeoutMs?: number;
}

export interface SslCheckerPort {
  check(hostname: string, port?: number, timeoutMs?: number): Promise<SslCheckResult>;
}
