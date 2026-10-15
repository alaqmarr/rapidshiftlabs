import type {
  HttpCheckerPort,
  HttpCheckOptions,
  HttpCheckResult,
} from "../../domain/ports/http-checker.port";
import {
  validateSafeOutboundUrl,
  SecurityError,
} from "../../../../shared/infrastructure/network/ssrf-guard";

const MAX_REDIRECTS = 5;

export class NodeHttpChecker implements HttpCheckerPort {
  async check(url: string, options?: HttpCheckOptions): Promise<HttpCheckResult> {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const start = performance.now();
    const timestamp = Date.now();
    const method = options?.method ?? "GET";

    try {
      let currentUrl = url;
      let redirectCount = 0;
      let response: Response;

      while (true) {
        // Step 1: SSRF Validation of target URL before opening connection
        const { url: validatedUrl } = await validateSafeOutboundUrl(currentUrl);

        // Step 2: Fetch with manual redirect to prevent uninspected internal redirects
        response = await fetch(validatedUrl.toString(), {
          method,
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "User-Agent": "RapidShift-Uptime-Bot/1.0 (+https://rapidshiftlabs.com)",
            ...(options?.headers ?? {}),
          },
          redirect: "manual",
        });

        // Step 3: Handle HTTP redirects
        const isRedirect =
          response.status === 301 ||
          response.status === 302 ||
          response.status === 303 ||
          response.status === 307 ||
          response.status === 308;

        if (isRedirect) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            await response.body?.cancel().catch(() => {});
            return {
              url,
              isUp: false,
              statusCode: response.status,
              latencyMs: Math.round(performance.now() - start),
              errorMessage: `Too many redirects (exceeded limit of ${MAX_REDIRECTS})`,
              timestamp,
            };
          }

          const location = response.headers.get("location");
          if (!location) {
            // Redirect header missing, terminate loop
            break;
          }

          // Resolve relative or absolute redirect destination
          const nextUrl = new URL(location, currentUrl).toString();
          await response.body?.cancel().catch(() => {});
          currentUrl = nextUrl;
          continue;
        }

        // Non-redirect response reached
        break;
      }

      const latencyMs = Math.round(performance.now() - start);

      let isUp = false;
      if (options?.expectedStatusCodes && options.expectedStatusCodes.length > 0) {
        isUp = options.expectedStatusCodes.includes(response.status);
      } else {
        isUp = response.status >= 200 && response.status < 400;
      }

      if (!isUp) {
        await response.body?.cancel().catch(() => {});
        return {
          url,
          isUp: false,
          statusCode: response.status,
          latencyMs,
          errorMessage: `HTTP status ${response.status}`,
          timestamp,
        };
      }

      if (options?.keyword) {
        const text = await response.text();
        if (!text.includes(options.keyword)) {
          return {
            url,
            isUp: false,
            statusCode: response.status,
            latencyMs,
            errorMessage: `Keyword "${options.keyword}" not found in response`,
            timestamp,
          };
        }
      } else {
        await response.body?.cancel().catch(() => {});
      }

      return {
        url,
        isUp: true,
        statusCode: response.status,
        latencyMs,
        timestamp,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      const isSecurity = err instanceof SecurityError;

      const message = isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : isSecurity
          ? `SSRF Blocked: ${err.message}`
          : (err?.cause?.message || err?.message || "HTTP request failed");

      return {
        url,
        isUp: false,
        statusCode: null,
        latencyMs,
        errorMessage: message,
        timestamp,
      };
    }
  }
}
