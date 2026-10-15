export interface HttpCheckResult {
  url: string;
  isUp: boolean;
  statusCode: number | null;
  latencyMs: number;
  errorMessage?: string;
  timestamp: number;
}

export interface HttpCheckOptions {
  timeoutMs?: number;
  keyword?: string | null;
  expectedStatusCodes?: number[];
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
}

export interface HttpCheckerPort {
  check(url: string, options?: HttpCheckOptions): Promise<HttpCheckResult>;
}
