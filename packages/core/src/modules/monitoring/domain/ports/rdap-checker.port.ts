export interface RdapCheckResult {
  hostname: string;
  isRegistered: boolean;
  expiresAt: number | null;
  daysRemaining: number | null;
  registrar: string | null;
  rawEvents?: Array<{ eventAction: string; eventDate: string }>;
  errorMessage?: string;
  timestamp: number;
}

export interface RdapCheckerPort {
  check(hostname: string, timeoutMs?: number): Promise<RdapCheckResult>;
}
