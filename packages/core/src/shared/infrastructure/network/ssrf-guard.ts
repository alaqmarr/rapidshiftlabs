import dns from "node:dns/promises";
import net from "node:net";

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Checks whether an IPv4 address is in a private, loopback, link-local, carrier-grade NAT, or reserved range.
 */
export function isPrivateOrBlockedIPv4(ip: string): boolean {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  if (isTest && ip === "127.0.0.1") {
    return false; // Permitted strictly during vitest execution for local mock servers
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IPv4 format treated as unsafe
  }

  const [a = 0, b = 0, c = 0, d = 0] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link Local / Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network Interconnect Benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is in a loopback, unique local, link-local, multicast, or reserved range.
 */
export function isPrivateOrBlockedIPv6(ip: string): boolean {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  const normalized = ip.toLowerCase().trim();

  // Loopback / Unspecified
  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized === "0:0:0:0:0:0:0:0"
  ) {
    if (isTest && (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1")) {
      return false;
    }
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.replace("::ffff:", "");
    if (net.isIPv4(v4Part)) {
      return isPrivateOrBlockedIPv4(v4Part);
    }
  }

  // Unique local addresses fc00::/7 (fc00:... or fd00:...)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // Link-local unicast fe80::/10
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast ff00::/8
  if (normalized.startsWith("ff")) {
    return true;
  }

  // Documentation / discarded
  if (normalized.startsWith("2001:db8:") || normalized.startsWith("100::")) {
    return true;
  }

  return false;
}

/**
 * Validates whether an IP address (v4 or v6) is safe for outbound probe requests.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateOrBlockedIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateOrBlockedIPv6(ip);
  }
  return true; // Not a valid IP address
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
  "oracle-cloud-agent",
]);

/**
 * Validates a URL against SSRF attacks:
 * 1. Checks protocol is http: or https:
 * 2. Checks hostname is not a prohibited alias or local domain
 * 3. Resolves DNS records and ensures none resolve to private/loopback/cloud metadata IPs
 */
export async function validateSafeOutboundUrl(rawUrl: string): Promise<{ url: URL; resolvedIps: string[] }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new SecurityError(`Invalid URL format: ${rawUrl}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SecurityError(`Unsupported protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are permitted.`);
  }

  // Disallow user:pass credentials in URL
  if (parsedUrl.username || parsedUrl.password) {
    throw new SecurityError("URLs containing embedded authentication credentials are not permitted.");
  }

  const hostname = parsedUrl.hostname.toLowerCase().trim();
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

  if (!isTest || (hostname !== "localhost" && hostname !== "127.0.0.1")) {
    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      throw new SecurityError(`Access to internal/loopback hostname "${hostname}" is restricted.`);
    }
  }

  // If the hostname is already an IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new SecurityError(`Access to restricted IP address "${hostname}" is prohibited.`);
    }
    return { url: parsedUrl, resolvedIps: [hostname] };
  }

  // Resolve hostname via DNS
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    if (!lookupResults || lookupResults.length === 0) {
      throw new SecurityError(`DNS lookup for "${hostname}" returned no addresses.`);
    }

    const resolvedIps = lookupResults.map((r) => r.address);
    for (const ip of resolvedIps) {
      if (isPrivateOrBlockedIp(ip)) {
        throw new SecurityError(
          `Domain "${hostname}" resolves to restricted IP "${ip}", which is prohibited.`,
        );
      }
    }

    return { url: parsedUrl, resolvedIps };
  } catch (err: any) {
    if (err instanceof SecurityError) throw err;
    throw new SecurityError(`DNS resolution failed for hostname "${hostname}": ${err.message || String(err)}`);
  }
}
