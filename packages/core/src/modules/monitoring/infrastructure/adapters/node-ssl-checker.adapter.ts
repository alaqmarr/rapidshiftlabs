import tls from "node:tls";
import net from "node:net";
import { isPrivateOrBlockedIp } from "../../../../shared/infrastructure/network/ssrf-guard";
import type {
  SslCheckerPort,
  SslCheckResult,
} from "../../domain/ports/ssl-checker.port";

export class NodeSslChecker implements SslCheckerPort {
  async check(
    hostname: string,
    port = 443,
    timeoutMs = 10_000,
  ): Promise<SslCheckResult> {
    const cleanHostname = hostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/:[0-9]+$/, "")
      .replace(/\/.*$/, "");

    if (
      cleanHostname === "localhost" ||
      cleanHostname.endsWith(".localhost") ||
      cleanHostname.endsWith(".local") ||
      cleanHostname.endsWith(".internal") ||
      (net.isIP(cleanHostname) !== 0 && isPrivateOrBlockedIp(cleanHostname))
    ) {
      return {
        hostname: cleanHostname,
        port,
        isValid: false,
        isExpired: true,
        daysRemaining: 0,
        validFrom: "",
        validTo: "",
        issuer: "",
        subject: "",
        sans: [],
        protocol: null,
        authError: "SSRF Blocked: Access to restricted host or IP is prohibited",
        errorMessage: "SSRF Blocked: Access to restricted host or IP is prohibited",
        timestamp: Date.now(),
      };
    }

    const isIp = net.isIP(cleanHostname) !== 0;

    return new Promise((resolve) => {
      const timestamp = Date.now();
      let resolved = false;

      const finish = (result: SslCheckResult) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      const socket = tls.connect(
        {
          host: cleanHostname,
          port,
          ...(isIp ? {} : { servername: cleanHostname }), // SNI only for domain hostnames per RFC 6066
          rejectUnauthorized: false, // Critical: inspect expired/self-signed certs
          timeout: timeoutMs,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const protocol = socket.getProtocol();
            const authorized = socket.authorized;
            const authError = socket.authorizationError
              ? String(socket.authorizationError)
              : null;

            socket.destroy();

            if (!cert || Object.keys(cert).length === 0) {
              return finish({
                hostname: cleanHostname,
                port,
                isValid: false,
                isExpired: true,
                daysRemaining: 0,
                validFrom: "",
                validTo: "",
                issuer: "",
                subject: "",
                sans: [],
                protocol,
                authError: "NO_CERTIFICATE",
                errorMessage: "No TLS peer certificate provided",
                timestamp,
              });
            }

            const validFrom = cert.valid_from
              ? new Date(cert.valid_from).toISOString()
              : "";
            const validToDate = cert.valid_to ? new Date(cert.valid_to) : null;
            const validTo = validToDate ? validToDate.toISOString() : "";
            const now = Date.now();

            const isExpired = validToDate ? now > validToDate.getTime() : true;
            const daysRemaining = validToDate
              ? Math.floor(
                  (validToDate.getTime() - now) / (1000 * 60 * 60 * 24),
                )
              : 0;

            const mismatchError = tls.checkServerIdentity(cleanHostname, cert);
            const isHostnameMatch = !mismatchError;

            const toStringVal = (
              val: string | string[] | undefined | null,
              fallback = "",
            ): string => {
              if (!val) return fallback;
              if (Array.isArray(val)) return val.join(", ");
              return String(val);
            };

            let sans: string[] = [];
            if (cert.subjectaltname) {
              sans = cert.subjectaltname
                .split(",")
                .map((s) => s.trim().replace(/^DNS:/, ""));
            } else if (cert.subject?.CN) {
              sans = Array.isArray(cert.subject.CN)
                ? cert.subject.CN.map((s) => String(s).trim())
                : [String(cert.subject.CN).trim()];
            }

            const issuer =
              toStringVal(cert.issuer?.CN) ||
              toStringVal(cert.issuer?.O) ||
              "Unknown Issuer";

            const subject =
              toStringVal(cert.subject?.CN) ||
              toStringVal(cert.subject?.O) ||
              cleanHostname;

            const isValid = authorized && !isExpired && isHostnameMatch;

            let errorMessage: string | undefined = undefined;
            if (isExpired) {
              errorMessage = authError || "Certificate has expired";
            } else if (mismatchError) {
              errorMessage = mismatchError.message;
            } else if (!authorized && authError) {
              errorMessage = authError;
            }

            return finish({
              hostname: cleanHostname,
              port,
              isValid,
              isExpired,
              daysRemaining,
              validFrom,
              validTo,
              issuer,
              subject,
              sans,
              protocol,
              authError,
              errorMessage,
              timestamp,
            });
          } catch (err: any) {
            socket.destroy();
            return finish({
              hostname: cleanHostname,
              port,
              isValid: false,
              isExpired: true,
              daysRemaining: 0,
              validFrom: "",
              validTo: "",
              issuer: "",
              subject: "",
              sans: [],
              protocol: null,
              authError: "PARSE_ERROR",
              errorMessage: err?.message || "Failed to parse certificate",
              timestamp,
            });
          }
        },
      );

      socket.on("error", (err: any) => {
        socket.destroy();
        finish({
          hostname: cleanHostname,
          port,
          isValid: false,
          isExpired: true,
          daysRemaining: 0,
          validFrom: "",
          validTo: "",
          issuer: "",
          subject: "",
          sans: [],
          protocol: null,
          authError: err?.code || "CONNECTION_ERROR",
          errorMessage: err?.message || "TLS connection failed",
          timestamp,
        });
      });

      socket.on("timeout", () => {
        socket.destroy();
        finish({
          hostname: cleanHostname,
          port,
          isValid: false,
          isExpired: true,
          daysRemaining: 0,
          validFrom: "",
          validTo: "",
          issuer: "",
          subject: "",
          sans: [],
          protocol: null,
          authError: "ETIMEDOUT",
          errorMessage: `TLS connection timed out after ${timeoutMs}ms`,
          timestamp,
        });
      });
    });
  }
}
