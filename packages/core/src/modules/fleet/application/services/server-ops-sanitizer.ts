import * as posixPath from "node:path/posix";
import { ValidationError, ForbiddenError } from "../../../../shared/kernel/errors";
import type {
  CreateNginxSiteInput,
  NginxSiteConfig,
  OutdatedPackageItem,
  ListeningPortEntry,
} from "../../domain/ports/server-admin-ops.port";

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

const SITE_FILENAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

const PACKAGE_NAME_REGEX =
  /^(?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9][a-zA-Z0-9.+:_-]{0,120}$/;

const BODY_SIZE_REGEX = /^\d{1,5}[kKmMgG]?$/;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;

const OCTAL_MODE_REGEX = /^[0-7]{3,4}$/;

const PROTECTED_EXACT_PATHS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/etc/passwd",
  "/etc/shadow",
  "/etc/group",
  "/etc/gshadow",
  "/etc/sudoers",
  "/etc/ssh",
  "/etc/ssh/sshd_config",
  "/lib",
  "/lib64",
  "/proc",
  "/root",
  "/sbin",
  "/sys",
  "/usr",
  "/var",
]);

const PROTECTED_PREFIXES_FOR_DELETE = [
  "/bin/",
  "/boot/",
  "/dev/",
  "/lib/",
  "/lib64/",
  "/proc/",
  "/sbin/",
  "/sys/",
  "/usr/bin/",
  "/usr/sbin/",
  "/usr/lib/",
];

export class ServerOpsSanitizer {
  public static shellQuote(value: string): string {
    if (value.includes("\0")) {
      throw new ValidationError("Null bytes are forbidden in shell arguments");
    }
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  public static validateDomain(rawDomain: string): string {
    const cleaned = String(rawDomain || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    if (!cleaned || cleaned.length > 253 || !DOMAIN_REGEX.test(cleaned)) {
      throw new ValidationError(
        `Invalid domain hostname: '${rawDomain}'. Expected a valid FQDN such as app.example.com.`
      );
    }
    return cleaned;
  }

  public static validateDomains(domains: string[]): string[] {
    if (!Array.isArray(domains) || domains.length === 0) {
      throw new ValidationError("At least one domain hostname is required");
    }
    if (domains.length > 15) {
      throw new ValidationError("Maximum of 15 domain aliases per Nginx server block");
    }
    const seen = new Set<string>();
    const validated: string[] = [];
    for (const d of domains) {
      const clean = this.validateDomain(d);
      if (!seen.has(clean)) {
        seen.add(clean);
        validated.push(clean);
      }
    }
    return validated;
  }

  public static validateSiteFilename(raw: string): string {
    const trimmed = String(raw || "").trim();
    if (
      !trimmed ||
      trimmed === "." ||
      trimmed === ".." ||
      trimmed.includes("..") ||
      trimmed.includes("/") ||
      trimmed.includes("\\") ||
      !SITE_FILENAME_REGEX.test(trimmed)
    ) {
      throw new ValidationError(
        `Invalid Nginx site filename: '${raw}'. Use letters, digits, dots, hyphens, or underscores.`
      );
    }
    return trimmed;
  }

  public static validatePort(port: unknown, fieldName = "port"): number {
    const num = Number(port);
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      throw new ValidationError(`Invalid ${fieldName}: must be an integer between 1 and 65535`);
    }
    return num;
  }

  public static validateEmail(email: string): string {
    const cleaned = String(email || "").trim();
    if (!cleaned || cleaned.length > 254 || !EMAIL_REGEX.test(cleaned)) {
      throw new ValidationError(`Invalid email address for Let's Encrypt: '${email}'`);
    }
    return cleaned;
  }

  public static validateOctalMode(mode: string): string {
    const cleaned = String(mode || "").trim();
    if (!OCTAL_MODE_REGEX.test(cleaned)) {
      throw new ValidationError(
        `Invalid chmod octal mode '${mode}'. Expected 3 or 4 octal digits (e.g. 0600, 0644, 0755).`
      );
    }
    return cleaned.length === 3 ? `0${cleaned}` : cleaned;
  }

  public static normalizeRemotePath(inputPath: string, homeDir = "/root"): string {
    const raw = String(inputPath || "").trim();
    if (!raw || raw === "~") {
      return posixPath.normalize(homeDir || "/root");
    }
    if (/[\x00-\x1f\x7f]/.test(raw)) {
      throw new ValidationError("Remote file path contains illegal control characters");
    }
    const expanded = raw.startsWith("~/")
      ? posixPath.join(homeDir || "/root", raw.slice(2))
      : raw;

    if (!expanded.startsWith("/")) {
      throw new ValidationError("Remote file path must be an absolute POSIX path starting with '/' or '~/'");
    }

    const normalized = posixPath.normalize(expanded);
    return normalized;
  }

  public static assertWritableFilePath(normalizedPath: string): void {
    if (PROTECTED_EXACT_PATHS.has(normalizedPath)) {
      throw new ForbiddenError(
        `Modification of protected operating system path '${normalizedPath}' is blocked for safety`
      );
    }
    if (
      normalizedPath.endsWith("/authorized_keys") ||
      normalizedPath === "/etc/sudoers" ||
      normalizedPath.startsWith("/etc/sudoers.d/") ||
      normalizedPath.startsWith("/proc/") ||
      normalizedPath.startsWith("/sys/") ||
      normalizedPath.startsWith("/dev/") ||
      normalizedPath.startsWith("/boot/")
    ) {
      throw new ForbiddenError(
        `Writing to critical kernel/auth system path '${normalizedPath}' is prohibited`
      );
    }
  }

  public static assertDeletablePath(normalizedPath: string): void {
    this.assertWritableFilePath(normalizedPath);
    for (const prefix of PROTECTED_PREFIXES_FOR_DELETE) {
      if (normalizedPath.startsWith(prefix)) {
        throw new ForbiddenError(
          `Deleting files inside critical OS binary directory '${prefix}' is prohibited`
        );
      }
    }
  }

  public static validatePackageName(pkg: string): string {
    const trimmed = String(pkg || "").trim();
    if (!trimmed || trimmed.startsWith("-") || !PACKAGE_NAME_REGEX.test(trimmed)) {
      throw new ValidationError(`Invalid or unsafe package identifier: '${pkg}'`);
    }
    return trimmed;
  }

  public static validateProxyHost(host = "127.0.0.1"): string {
    const cleaned = String(host || "127.0.0.1").trim();
    if (
      cleaned === "127.0.0.1" ||
      cleaned === "localhost" ||
      cleaned === "::1" ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(cleaned) ||
      DOMAIN_REGEX.test(cleaned)
    ) {
      return cleaned;
    }
    throw new ValidationError(`Invalid upstream proxy host: '${host}'`);
  }

  public static generateNginxConfig(input: CreateNginxSiteInput): string {
    const domains = this.validateDomains(input.domains);
    const serverNames = domains.join(" ");
    const maxBody = input.clientMaxBodySize
      ? String(input.clientMaxBodySize).trim()
      : "50M";
    if (!BODY_SIZE_REGEX.test(maxBody)) {
      throw new ValidationError(
        `Invalid client_max_body_size '${maxBody}'. Expected format like 10M, 50M, or 100M.`
      );
    }

    const lines: string[] = [
      `# Managed by RapidShift Labs Fleet Nginx Manager`,
      `# Primary Domain: ${domains[0]}`,
      `server {`,
      `    listen 80;`,
      `    listen [::]:80;`,
      `    server_name ${serverNames};`,
      ``,
      `    client_max_body_size ${maxBody};`,
    ];

    if (input.enableSecurityHeaders !== false) {
      lines.push(
        `    add_header X-Content-Type-Options "nosniff" always;`,
        `    add_header Referrer-Policy "strict-origin-when-cross-origin" always;`,
        `    add_header X-XSS-Protection "1; mode=block" always;`
      );
    }

    if (input.enableGzip !== false && input.mode !== "redirect") {
      lines.push(
        ``,
        `    gzip on;`,
        `    gzip_vary on;`,
        `    gzip_min_length 1024;`,
        `    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;`
      );
    }

    if (input.mode === "redirect") {
      const rawTarget = String(input.redirectTarget || "").trim();
      if (!rawTarget || !/^https?:\/\/[a-zA-Z0-9.-]+(?::\d{1,5})?(?:\/[^\s"';{}]*)?$/.test(rawTarget)) {
        throw new ValidationError(
          "Redirect target must be a valid HTTP/HTTPS URL (e.g. https://example.com)"
        );
      }
      const code = input.redirectPermanent !== false ? 301 : 302;
      const cleanTarget = rawTarget.replace(/\/$/, "");
      lines.push(
        ``,
        `    location /.well-known/acme-challenge/ {`,
        `        root /var/www/html;`,
        `    }`,
        ``,
        `    location / {`,
        `        return ${code} ${cleanTarget}$request_uri;`,
        `    }`
      );
    } else if (input.mode === "static") {
      const rootPath = this.normalizeRemotePath(input.rootPath || `/var/www/${domains[0]}/html`, "/var/www");
      if (/["';{}\s$`\\]/.test(rootPath)) {
        throw new ValidationError("Static root path contains unsafe characters for Nginx config");
      }
      const tryFiles =
        input.spaFallback !== false
          ? "$uri $uri/ /index.html"
          : "$uri $uri/ =404";

      lines.push(
        ``,
        `    root ${rootPath};`,
        `    index index.html index.htm;`,
        ``,
        `    location / {`,
        `        try_files ${tryFiles};`,
        `    }`,
        ``,
        `    location ~ /\\.(?!well-known).* {`,
        `        deny all;`,
        `    }`
      );
    } else {
      // Default: Reverse Proxy to PM2 / Node / Docker port
      const proxyHost = this.validateProxyHost(input.proxyHost || "127.0.0.1");
      const proxyPort = this.validatePort(input.proxyPort ?? 3000, "proxyPort");

      lines.push(
        ``,
        `    location / {`,
        `        proxy_pass http://${proxyHost}:${proxyPort};`,
        `        proxy_http_version 1.1;`,
        `        proxy_set_header Host $host;`,
        `        proxy_set_header X-Real-IP $remote_addr;`,
        `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
        `        proxy_set_header X-Forwarded-Proto $scheme;`
      );

      if (input.enableWebsockets !== false) {
        lines.push(
          `        proxy_set_header Upgrade $http_upgrade;`,
          `        proxy_set_header Connection "upgrade";`,
          `        proxy_cache_bypass $http_upgrade;`,
          `        proxy_buffering off;`
        );
      }

      lines.push(
        `        proxy_read_timeout 300s;`,
        `        proxy_send_timeout 300s;`,
        `    }`
      );
    }

    lines.push(`}`, ``);
    return lines.join("\n");
  }

  public static parseNginxSiteBlock(
    filename: string,
    rawConfig: string,
    enabledSet: Set<string>,
    sslExpiryMap: Record<string, string>
  ): NginxSiteConfig {
    // Strip comment lines for directive extraction
    const uncommented = rawConfig
      .split("\n")
      .map((line) => line.replace(/#.*$/, ""))
      .join("\n");

    const domains: string[] = [];
    const serverNameRegex = /server_name\s+([^;]+);/gi;
    let snMatch: RegExpExecArray | null;
    while ((snMatch = serverNameRegex.exec(uncommented)) !== null) {
      const tokens = snMatch[1]!
        .trim()
        .split(/\s+/)
        .filter((t) => t && t !== "_");
      for (const tok of tokens) {
        if (!domains.includes(tok)) domains.push(tok);
      }
    }

    const primaryDomain = domains[0] || filename;
    const proxyMatch = uncommented.match(/proxy_pass\s+(https?:\/\/[^;\s]+);/i);
    const proxyTarget = proxyMatch ? proxyMatch[1]! : null;
    let proxyPort: number | null = null;
    if (proxyTarget) {
      const portMatch = proxyTarget.match(/:(\d{1,5})(?:\/|$)/);
      if (portMatch) proxyPort = Number(portMatch[1]);
    }

    const rootMatch = uncommented.match(/\broot\s+([^;\s]+);/i);
    const rootPath = rootMatch ? rootMatch[1]! : null;

    const redirectMatch = uncommented.match(/\breturn\s+(?:301|302|307|308)\s+([^;\s]+);/i);
    const redirectTarget =
      redirectMatch && !proxyTarget && !uncommented.includes("managed by Certbot")
        ? redirectMatch[1]!
        : null;

    const sslEnabled =
      /\blisten\s+[^\n;]*443\s+ssl\b/i.test(uncommented) ||
      /\bssl_certificate\s+/i.test(uncommented);

    const sslCertMatch = uncommented.match(/\bssl_certificate\s+([^;\s]+);/i);
    const sslCertPath = sslCertMatch ? sslCertMatch[1]! : null;

    let sslExpiresAt: string | null = null;
    if (sslCertPath && sslExpiryMap[sslCertPath]) {
      sslExpiresAt = sslExpiryMap[sslCertPath]!;
    } else if (sslExpiryMap[primaryDomain]) {
      sslExpiresAt = sslExpiryMap[primaryDomain]!;
    }

    const websocketsEnabled = /proxy_set_header\s+Upgrade\b/i.test(uncommented);
    const bodySizeMatch = uncommented.match(/client_max_body_size\s+([^;\s]+);/i);

    let mode: NginxSiteConfig["mode"] = "custom";
    if (proxyTarget) mode = "proxy";
    else if (redirectTarget) mode = "redirect";
    else if (rootPath) mode = "static";

    return {
      filename,
      domains: domains.length > 0 ? domains : [filename],
      primaryDomain,
      enabled: enabledSet.has(filename),
      mode,
      proxyTarget,
      proxyPort,
      rootPath,
      redirectTarget,
      sslEnabled,
      sslCertPath,
      sslExpiresAt,
      websocketsEnabled,
      clientMaxBodySize: bodySizeMatch ? bodySizeMatch[1]! : null,
      rawConfig,
    };
  }

  public static parseListeningPorts(ssOutput: string): ListeningPortEntry[] {
    const entries: ListeningPortEntry[] = [];
    const seen = new Set<number>();
    const lines = (ssOutput || "").split("\n");
    for (const line of lines) {
      if (!line.includes("LISTEN")) continue;
      // Example: LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=20))
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const localAddr = parts[3] || "";
      const portMatch = localAddr.match(/:(\d{1,5})$/);
      if (!portMatch) continue;
      const port = Number(portMatch[1]);
      if (!port || port === 22 || port === 80 || port === 443 || port === 53 || seen.has(port)) {
        continue;
      }
      seen.add(port);
      const procMatch = line.match(/\(\("([^"]+)"/);
      const processName = procMatch ? procMatch[1]! : "service";
      const address = localAddr.replace(`:${port}`, "") || "0.0.0.0";
      entries.push({ port, address, process: processName });
    }
    return entries.sort((a, b) => a.port - b.port);
  }

  public static classifyVersionDiff(
    current: string,
    latest: string,
    isSecurity: boolean
  ): OutdatedPackageItem["severity"] {
    if (isSecurity) return "critical";
    const cleanVer = (v: string) =>
      v
        .replace(/^\d+:/, "") // strip epoch like 1:1.24.0
        .split(/[-+~]/)[0]!
        .split(".")
        .map((n) => parseInt(n, 10));

    const curParts = cleanVer(current);
    const latParts = cleanVer(latest);
    if (
      !Number.isNaN(curParts[0]) &&
      !Number.isNaN(latParts[0]) &&
      curParts[0] !== latParts[0]
    ) {
      return "major";
    }
    if (
      !Number.isNaN(curParts[1]) &&
      !Number.isNaN(latParts[1]) &&
      curParts[1] !== latParts[1]
    ) {
      return "minor";
    }
    return "patch";
  }

  public static parseAptUpgradable(stdout: string): OutdatedPackageItem[] {
    const items: OutdatedPackageItem[] = [];
    const lines = (stdout || "").split("\n");
    // Format: openssl/noble-updates,noble-security 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]
    const aptRegex =
      /^([a-zA-Z0-9.+:_-]+)\/([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+\[upgradable from:\s*([^\]]+)\]/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("Listing") || line.startsWith("WARNING")) continue;
      const match = line.match(aptRegex);
      if (!match) continue;
      const name = match[1]!;
      const repo = match[2]!;
      const latestVersion = match[3]!;
      const architecture = match[4]!;
      const currentVersion = match[5]!.trim();
      const isSecurity = repo.toLowerCase().includes("security");

      items.push({
        name,
        ecosystem: "apt",
        currentVersion,
        latestVersion,
        architecture,
        repository: repo,
        isSecurity,
        severity: this.classifyVersionDiff(currentVersion, latestVersion, isSecurity),
      });
    }
    return items;
  }

  public static parseNpmOutdatedJson(
    stdout: string,
    ecosystem: "npm-global" | "project-npm",
    projectPath?: string
  ): OutdatedPackageItem[] {
    const trimmed = (stdout || "").trim();
    if (!trimmed) return [];
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return [];

    try {
      const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<
        string,
        { current?: string; wanted?: string; latest?: string; location?: string }
      >;
      const items: OutdatedPackageItem[] = [];
      for (const [pkgName, info] of Object.entries(parsed)) {
        if (!info || typeof info !== "object") continue;
        const currentVersion = String(info.current || "missing");
        const latestVersion = String(info.latest || info.wanted || "unknown");
        if (currentVersion === latestVersion) continue;
        items.push({
          name: pkgName,
          ecosystem,
          currentVersion,
          latestVersion,
          wantedVersion: info.wanted ? String(info.wanted) : undefined,
          isSecurity: false,
          severity: this.classifyVersionDiff(currentVersion, latestVersion, false),
          projectPath,
        });
      }
      return items;
    } catch {
      return [];
    }
  }
}
