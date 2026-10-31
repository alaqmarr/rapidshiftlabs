"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Globe,
  ShieldCheck,
  ShieldAlert,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Lock,
  ExternalLink,
  Code2,
  FileText,
  Play,
  Pause,
  Sparkles,
  Server,
  ArrowRight,
  X,
  Copy,
  Check,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import type { SerializedProcess, ClientOption } from "./server-manager";

interface NginxSite {
  filename: string;
  domains: string[];
  primaryDomain: string;
  enabled: boolean;
  mode: "proxy" | "static" | "redirect" | "custom";
  proxyTarget: string | null;
  proxyPort: number | null;
  rootPath: string | null;
  redirectTarget: string | null;
  sslEnabled: boolean;
  sslCertPath: string | null;
  sslExpiresAt: string | null;
  websocketsEnabled: boolean;
  clientMaxBodySize: string | null;
  rawConfig: string;
}

interface ListeningPort {
  port: number;
  address: string;
  process: string;
}

interface NginxStatusPayload {
  installed: boolean;
  running: boolean;
  version: string | null;
  certbotInstalled: boolean;
  configTestOk: boolean;
  configTestOutput: string;
  listeningPorts: ListeningPort[];
  sites: NginxSite[];
  simulatedFallback?: boolean;
}

interface NginxSslManagerProps {
  serverId: string;
  serverName: string;
  serverHost: string;
  processes: SerializedProcess[];
  clients: ClientOption[];
}

function buildLivePreviewConfig(params: {
  domains: string[];
  mode: "proxy" | "static" | "redirect";
  proxyHost: string;
  proxyPort: string;
  rootPath: string;
  spaFallback: boolean;
  redirectTarget: string;
  redirectPermanent: boolean;
  enableWebsockets: boolean;
  clientMaxBodySize: string;
  enableGzip: boolean;
  enableSecurityHeaders: boolean;
}): string {
  const cleanDomains = params.domains.filter(Boolean);
  const serverNames = cleanDomains.length > 0 ? cleanDomains.join(" ") : "app.yourdomain.com";
  const lines: string[] = [
    `# Managed by RapidShift Labs Fleet Nginx Manager`,
    `server {`,
    `    listen 80;`,
    `    listen [::]:80;`,
    `    server_name ${serverNames};`,
    ``,
    `    client_max_body_size ${params.clientMaxBodySize || "50M"};`,
  ];

  if (params.enableSecurityHeaders) {
    lines.push(
      `    add_header X-Content-Type-Options "nosniff" always;`,
      `    add_header Referrer-Policy "strict-origin-when-cross-origin" always;`,
      `    add_header X-XSS-Protection "1; mode=block" always;`
    );
  }

  if (params.enableGzip && params.mode !== "redirect") {
    lines.push(
      ``,
      `    gzip on;`,
      `    gzip_vary on;`,
      `    gzip_min_length 1024;`,
      `    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;`
    );
  }

  if (params.mode === "redirect") {
    const code = params.redirectPermanent ? 301 : 302;
    const target = (params.redirectTarget || "https://target-domain.com").replace(/\/$/, "");
    lines.push(
      ``,
      `    location / {`,
      `        return ${code} ${target}$request_uri;`,
      `    }`
    );
  } else if (params.mode === "static") {
    const root = params.rootPath || `/var/www/${cleanDomains[0] || "app"}/dist`;
    lines.push(
      ``,
      `    root ${root};`,
      `    index index.html index.htm;`,
      ``,
      `    location / {`,
      `        try_files ${params.spaFallback ? "$uri $uri/ /index.html" : "$uri $uri/ =404"};`,
      `    }`
    );
  } else {
    lines.push(
      ``,
      `    location / {`,
      `        proxy_pass http://${params.proxyHost || "127.0.0.1"}:${params.proxyPort || "3000"};`,
      `        proxy_http_version 1.1;`,
      `        proxy_set_header Host $host;`,
      `        proxy_set_header X-Real-IP $remote_addr;`,
      `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
      `        proxy_set_header X-Forwarded-Proto $scheme;`
    );
    if (params.enableWebsockets) {
      lines.push(
        `        proxy_set_header Upgrade $http_upgrade;`,
        `        proxy_set_header Connection "upgrade";`,
        `        proxy_buffering off;`
      );
    }
    lines.push(`        proxy_read_timeout 300s;`, `    }`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

export function NginxSslManager({
  serverId,
  serverName,
  serverHost,
  processes,
  clients,
}: NginxSslManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [nginx, setNginx] = useState<NginxStatusPayload | null>(null);
  const [defaultSslEmail, setDefaultSslEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [actionSiteName, setActionSiteName] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create / Link Domain Wizard Modal
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [includeWww, setIncludeWww] = useState(false);
  const [extraAliases, setExtraAliases] = useState("");
  const [linkClientId, setLinkClientId] = useState("");
  const [mode, setMode] = useState<"proxy" | "static" | "redirect">("proxy");
  const [proxyHost, setProxyHost] = useState("127.0.0.1");
  const [proxyPort, setProxyPort] = useState("3000");
  const [rootPath, setRootPath] = useState("/var/www/html");
  const [spaFallback, setSpaFallback] = useState(true);
  const [redirectTarget, setRedirectTarget] = useState("https://");
  const [redirectPermanent, setRedirectPermanent] = useState(true);
  const [enableWebsockets, setEnableWebsockets] = useState(true);
  const [clientMaxBodySize, setClientMaxBodySize] = useState("50M");
  const [enableGzip, setEnableGzip] = useState(true);
  const [enableSecurityHeaders, setEnableSecurityHeaders] = useState(true);
  const [autoProvisionSsl, setAutoProvisionSsl] = useState(true);
  const [sslEmail, setSslEmail] = useState("");
  const [autoInstallCertbot, setAutoInstallCertbot] = useState(true);
  const [showRawPreview, setShowRawPreview] = useState(false);
  const [rawOverrideEnabled, setRawOverrideEnabled] = useState(false);
  const [rawOverrideText, setRawOverrideText] = useState("");
  const [isSavingSite, setIsSavingSite] = useState(false);

  // Direct SSL Modal for an existing site
  const [sslTargetSite, setSslTargetSite] = useState<NginxSite | null>(null);
  const [isProvisioningSsl, setIsProvisioningSsl] = useState(false);
  const [sslOutputLog, setSslOutputLog] = useState<string | null>(null);

  // Inspect Raw Site Config Modal
  const [inspectSite, setInspectSite] = useState<NginxSite | null>(null);
  const [inspectEditedRaw, setInspectEditedRaw] = useState("");
  const [isSavingRawEdit, setIsSavingRawEdit] = useState(false);

  // Nginx Logs Drawer
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [logType, setLogType] = useState<"error" | "access">("error");
  const [logsText, setLogsText] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadNginxStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch Nginx status");
      setNginx(data.nginx);
      if (data.defaultSslEmail) {
        setDefaultSslEmail(data.defaultSslEmail);
        setSslEmail((prev) => prev || data.defaultSslEmail);
      }
    } catch (err: any) {
      showError("Nginx Probe Error", err.message);
    } finally {
      setLoading(false);
    }
  }, [serverId, showError]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/admin/servers/${serverId}/nginx`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) throw new Error(d.error || "Failed to fetch Nginx status");
        setNginx(d.nginx);
        if (d.defaultSslEmail) {
          setDefaultSslEmail(d.defaultSslEmail);
          setSslEmail((prev) => prev || d.defaultSslEmail);
        }
      })
      .catch((err: any) => {
        if (active) showError("Nginx Probe Error", err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serverId, showError]);

  const computedDomains = useMemo(() => {
    const list: string[] = [];
    const main = primaryDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (main) {
      list.push(main);
      if (includeWww && !main.startsWith("www.")) {
        list.push(`www.${main}`);
      }
    }
    if (extraAliases.trim()) {
      for (const part of extraAliases.split(/[,\s]+/)) {
        const clean = part.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (clean && !list.includes(clean)) list.push(clean);
      }
    }
    return list;
  }, [primaryDomain, includeWww, extraAliases]);

  const previewConfig = useMemo(
    () =>
      buildLivePreviewConfig({
        domains: computedDomains,
        mode,
        proxyHost,
        proxyPort,
        rootPath,
        spaFallback,
        redirectTarget,
        redirectPermanent,
        enableWebsockets,
        clientMaxBodySize,
        enableGzip,
        enableSecurityHeaders,
      }),
    [
      computedDomains,
      mode,
      proxyHost,
      proxyPort,
      rootPath,
      spaFallback,
      redirectTarget,
      redirectPermanent,
      enableWebsockets,
      clientMaxBodySize,
      enableGzip,
      enableSecurityHeaders,
    ]
  );

  async function handleTestAndReload() {
    setReloading(true);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nginx reload failed");
      showSuccess("Nginx Validated & Reloaded", data.output || "Syntax OK & graceful reload complete.");
      void loadNginxStatus();
    } catch (err: any) {
      showError("Nginx Validation Failed", err.message);
    } finally {
      setReloading(false);
    }
  }

  async function handleCreateAndLinkDomain(e: React.FormEvent) {
    e.preventDefault();
    if (computedDomains.length === 0) {
      showError("Domain Required", "Enter at least one domain or subdomain (e.g. app.client.com).");
      return;
    }

    setIsSavingSite(true);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          domains: computedDomains,
          clientId: linkClientId || undefined,
          mode,
          proxyHost,
          proxyPort: Number(proxyPort) || 3000,
          rootPath,
          spaFallback,
          redirectTarget,
          redirectPermanent,
          enableWebsockets,
          clientMaxBodySize,
          enableGzip,
          enableSecurityHeaders,
          enableSite: true,
          rawOverride: rawOverrideEnabled ? rawOverrideText : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create Nginx virtual host");

      let sslNote = "HTTP reverse proxy active & Nginx gracefully reloaded.";
      if (autoProvisionSsl) {
        const sslRes = await fetch(`/api/v1/admin/servers/${serverId}/nginx/ssl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domains: computedDomains,
            email: sslEmail || defaultSslEmail,
            redirectHttpToHttps: true,
            installCertbotIfMissing: autoInstallCertbot,
          }),
        });
        const sslData = await sslRes.json();
        if (sslRes.ok) {
          sslNote = `Let's Encrypt SSL certificate provisioned & HTTPS 443 redirect enabled!`;
        } else {
          showError(
            "Nginx Site Created — SSL Pending DNS",
            `Domain block '${data.filename}' is live on port 80, but Certbot reported: ${sslData.error}. Verify your DNS A-record points to ${serverHost} and click 'Generate SSL' on the card.`
          );
          setIsWizardOpen(false);
          setPrimaryDomain("");
          void loadNginxStatus();
          return;
        }
      }

      showSuccess(
        "Domain Linked & Live",
        `${computedDomains.join(", ")} configured on ${serverName}. ${sslNote}`
      );
      setIsWizardOpen(false);
      setPrimaryDomain("");
      setExtraAliases("");
      void loadNginxStatus();
    } catch (err: any) {
      showError("Nginx Configuration Error", err.message);
    } finally {
      setIsSavingSite(false);
    }
  }

  async function handleProvisionSslForSite(e: React.FormEvent) {
    e.preventDefault();
    if (!sslTargetSite) return;
    setIsProvisioningSsl(true);
    setSslOutputLog(null);

    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx/ssl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domains: sslTargetSite.domains,
          email: sslEmail || defaultSslEmail,
          redirectHttpToHttps: true,
          installCertbotIfMissing: autoInstallCertbot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SSL generation failed");

      setSslOutputLog(data.output || "SSL certificate issued and deployed.");
      showSuccess(
        "SSL Certificate Issued",
        `HTTPS (443) is now active for ${sslTargetSite.domains.join(", ")}.`
      );
      void loadNginxStatus();
    } catch (err: any) {
      setSslOutputLog(`ERROR: ${err.message}`);
      showError("SSL Generation Failed", err.message);
    } finally {
      setIsProvisioningSsl(false);
    }
  }

  async function handleToggleSite(site: NginxSite) {
    setActionSiteName(site.filename);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          filename: site.filename,
          enable: !site.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle site");
      showSuccess(
        !site.enabled ? "Site Enabled" : "Site Disabled",
        `${site.filename} is now ${!site.enabled ? "enabled in sites-enabled" : "disabled"} and Nginx reloaded.`
      );
      void loadNginxStatus();
    } catch (err: any) {
      showError("Toggle Failed", err.message);
    } finally {
      setActionSiteName(null);
    }
  }

  async function handleDeleteSite(site: NginxSite) {
    if (!window.confirm(`Remove Nginx virtual host '${site.filename}' (${site.domains.join(", ")}) from ${serverName}?`)) {
      return;
    }
    setActionSiteName(site.filename);
    try {
      const res = await fetch(
        `/api/v1/admin/servers/${serverId}/nginx?filename=${encodeURIComponent(site.filename)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove site");
      showSuccess("Site Removed", `Removed '${site.filename}' and reloaded Nginx.`);
      void loadNginxStatus();
    } catch (err: any) {
      showError("Delete Failed", err.message);
    } finally {
      setActionSiteName(null);
    }
  }

  async function handleSaveRawSiteEdit() {
    if (!inspectSite) return;
    setIsSavingRawEdit(true);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          filename: inspectSite.filename,
          domains: inspectSite.domains,
          enableSite: inspectSite.enabled,
          rawOverride: inspectEditedRaw,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Syntax check failed");
      showSuccess("Config Validated & Saved", `Updated ${inspectSite.filename} and reloaded Nginx.`);
      setInspectSite(null);
      void loadNginxStatus();
    } catch (err: any) {
      showError("Nginx Syntax Error (Rolled Back)", err.message);
    } finally {
      setIsSavingRawEdit(false);
    }
  }

  async function fetchNginxLogs(kind: "error" | "access") {
    setLogType(kind);
    setLogsDrawerOpen(true);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/nginx?logs=${kind}&lines=120`);
      const data = await res.json();
      setLogsText(data.logs || "No log output.");
    } catch (err: any) {
      setLogsText(`Failed to load logs: ${err.message}`);
    } finally {
      setLoadingLogs(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl overflow-hidden shadow-xs">
      {/* Header & Engine Telemetry Bar */}
      <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-bold steel-heading text-zinc-900 dark:text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Nginx Reverse Proxy &amp; Direct SSL Manager
              </h3>
              {nginx && (
                <>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-tech font-semibold border ${
                      nginx.running
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                    }`}
                  >
                    {nginx.installed
                      ? `nginx/${nginx.version || "active"} · ${nginx.running ? "Running" : "Stopped"}`
                      : "Nginx Not Detected"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-tech border ${
                      nginx.certbotInstalled
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                    }`}
                  >
                    {nginx.certbotInstalled ? "Certbot SSL Ready" : "Certbot Auto-Installable"}
                  </span>
                  {nginx.simulatedFallback && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-tech bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Sandbox Preview
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Visually link domains to PM2 apps or static builds without writing Nginx blocks — includes atomic{" "}
              <code className="font-mono text-[11px] text-zinc-300">nginx -t</code> rollback &amp; 1-click Let&apos;s Encrypt SSL.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchNginxLogs("error")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Nginx Logs
            </button>

            <button
              type="button"
              onClick={handleTestAndReload}
              disabled={reloading || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer disabled:opacity-50"
            >
              {reloading ? (
                <IosSpinner size="xs" className="text-blue-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              )}
              Test &amp; Reload
            </button>

            <button
              type="button"
              onClick={() => {
                setRawOverrideEnabled(false);
                setShowRawPreview(false);
                setIsWizardOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Link Domain &amp; SSL
            </button>
          </div>
        </div>

        {/* Detected Active App Ports Bar */}
        {nginx && nginx.listeningPorts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-[11px] font-tech">
            <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              Active App Ports on {serverName}:
            </span>
            {nginx.listeningPorts.map((lp) => (
              <button
                key={lp.port}
                type="button"
                onClick={() => {
                  setMode("proxy");
                  setProxyPort(String(lp.port));
                  setIsWizardOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition cursor-pointer"
                title={`Click to link a domain to port ${lp.port}`}
              >
                <span className="font-bold">:{lp.port}</span>
                <span className="text-zinc-400">({lp.process})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sites List */}
      {loading ? (
        <div className="p-12 text-center space-y-2">
          <IosSpinner size="md" className="mx-auto text-blue-500" />
          <p className="text-xs font-tech text-zinc-400">
            Scanning /etc/nginx/sites-available, symlinks, and Let&apos;s Encrypt certificates...
          </p>
        </div>
      ) : !nginx || nginx.sites.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <Globe className="w-9 h-9 mx-auto text-zinc-500 opacity-50" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-200">
              No Nginx domain virtual hosts configured yet
            </p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Point your domain&apos;s DNS A-record to <strong className="text-zinc-200">{serverHost}</strong>, then click{" "}
              <strong>Link Domain &amp; SSL</strong> to bind it to any PM2 port and issue HTTPS automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-bold transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Create First Domain Block
          </button>
        </div>
      ) : (
        <div className="p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {nginx.sites.map((site) => {
            const busy = actionSiteName === site.filename;
            const protocol = site.sslEnabled ? "https" : "http";
            return (
              <div
                key={site.filename}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3.5 transition ${
                  site.enabled
                    ? "bg-zinc-50/60 dark:bg-zinc-950/70 border-zinc-200 dark:border-zinc-800/90"
                    : "bg-zinc-100/40 dark:bg-zinc-950/30 border-dashed border-zinc-300 dark:border-zinc-800 opacity-75"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`${protocol}://${site.primaryDomain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-steel font-bold text-sm text-zinc-900 dark:text-white hover:text-blue-400 inline-flex items-center gap-1 truncate"
                        >
                          {site.primaryDomain}
                          <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                        </a>
                        {site.domains.length > 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-tech">
                            +{site.domains.length - 1} alias
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-tech text-zinc-400 mt-0.5">
                        /etc/nginx/sites-available/{site.filename}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {site.sslEnabled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-tech font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <Lock className="w-3 h-3" /> HTTPS SSL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-tech font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <ShieldAlert className="w-3 h-3" /> HTTP Only
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-tech font-semibold border ${
                          site.enabled
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {site.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  {/* Target Route Summary Box */}
                  <div className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 text-xs font-tech flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                        {site.mode}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="font-semibold text-blue-400 truncate">
                        {site.proxyTarget || site.rootPath || site.redirectTarget || "Custom directives"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                      {site.websocketsEnabled && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          WS/SSE
                        </span>
                      )}
                      {site.clientMaxBodySize && <span>Max {site.clientMaxBodySize}</span>}
                    </div>
                  </div>

                  {site.sslExpiresAt && (
                    <div className="text-[11px] font-tech text-emerald-400/90 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Cert valid until: {site.sslExpiresAt}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSslTargetSite(site);
                      setSslOutputLog(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-tech font-bold border transition cursor-pointer ${
                      site.sslEnabled
                        ? "bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-emerald-500/30"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {site.sslEnabled ? "Renew / Re-Issue SSL" : "Generate Free SSL"}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setInspectSite(site);
                        setInspectEditedRaw(site.rawConfig);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-tech font-semibold border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5 text-blue-400" />
                      Config
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggleSite(site)}
                      className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                      title={site.enabled ? "Disable site" : "Enable site"}
                    >
                      {site.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeleteSite(site)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition cursor-pointer"
                      title="Delete Nginx site"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: ZERO-CODE DOMAIN & REVERSE PROXY LINKER + DIRECT SSL
         ===================================================================== */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3.5">
              <div>
                <h3 className="font-steel font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  Link Domain &amp; Provision SSL on {serverName}
                </h3>
                <p className="text-xs text-zinc-400 font-tech mt-0.5">
                  Point your DNS A-record to <strong className="text-zinc-200">{serverHost}</strong> — no Nginx config typing needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWizardOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAndLinkDomain} className="space-y-4 text-xs">
              {/* Step 1: Domain & Tenant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-zinc-200">
                    Primary Domain / Subdomain *
                  </label>
                  <input
                    type="text"
                    required
                    value={primaryDomain}
                    onChange={(e) => setPrimaryDomain(e.target.value)}
                    placeholder="app.clientdomain.com"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 font-tech focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="inline-flex items-center gap-2 mt-2 text-[11px] text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeWww}
                      onChange={(e) => setIncludeWww(e.target.checked)}
                      className="rounded border-zinc-700 text-blue-600"
                    />
                    Also link <code className="text-zinc-300">www.</code> subdomain alias
                  </label>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-zinc-200">
                    Link to Client &amp; Monitor (Optional)
                  </label>
                  <select
                    value={linkClientId}
                    onChange={(e) => setLinkClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 font-tech focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Internal / Do not add to Client Monitor</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Auto-monitor HTTPS, SSL &amp; DNS)
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={extraAliases}
                    onChange={(e) => setExtraAliases(e.target.value)}
                    placeholder="Extra aliases (comma-separated, optional)"
                    className="w-full mt-2 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-tech text-[11px]"
                  />
                </div>
              </div>

              {/* Step 2: Visual Routing Mode */}
              <div className="space-y-2">
                <label className="block font-semibold text-zinc-200">Routing Mode</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: "proxy",
                        title: "App / PM2 Proxy",
                        desc: "Forward to localhost port",
                      },
                      {
                        id: "static",
                        title: "Static / SPA Build",
                        desc: "Serve folder / index.html",
                      },
                      {
                        id: "redirect",
                        title: "301/302 Redirect",
                        desc: "Forward to another URL",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        mode === opt.id
                          ? "bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500/30"
                          : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.title}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-Specific Target Selector */}
              {mode === "proxy" && (
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold mb-1 text-zinc-300">Upstream Host</label>
                      <input
                        type="text"
                        value={proxyHost}
                        onChange={(e) => setProxyHost(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 font-tech"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-semibold mb-1 text-zinc-300">
                        Target App Port *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        required
                        value={proxyPort}
                        onChange={(e) => setProxyPort(e.target.value)}
                        placeholder="3000"
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 font-tech"
                      />
                    </div>
                  </div>

                  {/* Quick Port Chips from Live Server Socket Scan + Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400 font-tech">Quick pick port:</span>
                    {(nginx?.listeningPorts.length
                      ? nginx.listeningPorts.map((lp) => ({
                          port: String(lp.port),
                          label: `:${lp.port} (${lp.process})`,
                        }))
                      : [
                          { port: "3000", label: ":3000 (Next.js)" },
                          { port: "3001", label: ":3001" },
                          { port: "4000", label: ":4000 (API)" },
                          { port: "5000", label: ":5000" },
                          { port: "8080", label: ":8080" },
                        ]
                    ).map((chip) => (
                      <button
                        key={chip.port}
                        type="button"
                        onClick={() => setProxyPort(chip.port)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-tech border transition cursor-pointer ${
                          proxyPort === chip.port
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-blue-500/40"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {processes.length > 0 && (
                    <div className="text-[11px] text-zinc-400 font-tech">
                      Running PM2 apps on this host:{" "}
                      {processes.map((p) => `${p.name} (#${p.pm2Id})`).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {mode === "static" && (
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div>
                    <label className="block font-semibold mb-1 text-zinc-300">
                      Server Build Directory Path *
                    </label>
                    <input
                      type="text"
                      required
                      value={rootPath}
                      onChange={(e) => setRootPath(e.target.value)}
                      placeholder="/var/www/my-project/dist"
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 font-tech"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={spaFallback}
                      onChange={(e) => setSpaFallback(e.target.checked)}
                      className="rounded border-zinc-700 text-blue-600"
                    />
                    Enable React / Vite SPA router fallback (<code className="text-blue-400">try_files $uri /index.html</code>)
                  </label>
                </div>
              )}

              {mode === "redirect" && (
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div>
                    <label className="block font-semibold mb-1 text-zinc-300">
                      Destination URL *
                    </label>
                    <input
                      type="url"
                      required
                      value={redirectTarget}
                      onChange={(e) => setRedirectTarget(e.target.value)}
                      placeholder="https://newdomain.com"
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 font-tech"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={redirectPermanent}
                      onChange={(e) => setRedirectPermanent(e.target.checked)}
                      className="rounded border-zinc-700 text-blue-600"
                    />
                    Permanent SEO Redirect (HTTP 301)
                  </label>
                </div>
              )}

              {/* Step 3: Production Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 font-tech text-[11px]">
                <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableWebsockets}
                    onChange={(e) => setEnableWebsockets(e.target.checked)}
                    className="rounded border-zinc-700 text-blue-600"
                  />
                  WebSockets / SSE
                </label>
                <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableGzip}
                    onChange={(e) => setEnableGzip(e.target.checked)}
                    className="rounded border-zinc-700 text-blue-600"
                  />
                  Gzip Compression
                </label>
                <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSecurityHeaders}
                    onChange={(e) => setEnableSecurityHeaders(e.target.checked)}
                    className="rounded border-zinc-700 text-blue-600"
                  />
                  Security Headers
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Upload:</span>
                  <select
                    value={clientMaxBodySize}
                    onChange={(e) => setClientMaxBodySize(e.target.value)}
                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                  >
                    <option value="10M">10M</option>
                    <option value="50M">50M</option>
                    <option value="100M">100M</option>
                    <option value="500M">500M</option>
                  </select>
                </div>
              </div>

              {/* Step 4: Direct Let's Encrypt SSL Provisioning */}
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/25 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoProvisionSsl}
                    onChange={(e) => setAutoProvisionSsl(e.target.checked)}
                    className="mt-0.5 rounded border-emerald-600 text-emerald-600"
                  />
                  <div>
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Generate Free Let&apos;s Encrypt SSL Certificate Directly
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Automatically runs Certbot after linking the domain and enables HTTP → HTTPS redirect.
                    </p>
                  </div>
                </label>

                {autoProvisionSsl && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                        Let&apos;s Encrypt Expiry Notice Email *
                      </label>
                      <input
                        type="email"
                        required={autoProvisionSsl}
                        value={sslEmail}
                        onChange={(e) => setSslEmail(e.target.value)}
                        placeholder="ops@yourdomain.com"
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950 font-tech"
                      />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label className="inline-flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoInstallCertbot}
                          onChange={(e) => setAutoInstallCertbot(e.target.checked)}
                          className="rounded border-zinc-700 text-emerald-600"
                        />
                        Auto-install Certbot if not installed on server
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Generated Config Preview */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setShowRawPreview(!showRawPreview);
                    if (!rawOverrideText) setRawOverrideText(previewConfig);
                  }}
                  className="text-[11px] font-tech text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showRawPreview ? "Hide generated Nginx block" : "Preview generated Nginx server block"}
                </button>

                {showRawPreview && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rawOverrideEnabled}
                          onChange={(e) => {
                            setRawOverrideEnabled(e.target.checked);
                            if (e.target.checked) setRawOverrideText(previewConfig);
                          }}
                          className="rounded border-zinc-700 text-blue-600"
                        />
                        Customize raw Nginx block manually
                      </label>
                    </div>
                    <textarea
                      rows={10}
                      readOnly={!rawOverrideEnabled}
                      value={rawOverrideEnabled ? rawOverrideText : previewConfig}
                      onChange={(e) => setRawOverrideText(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-tech font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSite}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-tech font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingSite ? (
                    <IosSpinner size="xs" className="text-white" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isSavingSite
                    ? autoProvisionSsl
                      ? "Linking Domain & Issuing SSL..."
                      : "Deploying Nginx Block..."
                    : autoProvisionSsl
                    ? "Deploy Domain & Issue SSL"
                    : "Deploy Nginx Block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: 1-CLICK DIRECT SSL GENERATOR FOR EXISTING SITE
         ===================================================================== */}
      {sslTargetSite && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-steel font-bold text-base text-white">
                    Direct Let&apos;s Encrypt SSL Provisioning
                  </h3>
                  <p className="text-xs font-tech text-zinc-400">
                    {sslTargetSite.domains.join(", ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSslTargetSite(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionSslForSite} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-tech text-zinc-300 space-y-1">
                <div>
                  1. Verify DNS <code className="text-blue-400">A</code> record for{" "}
                  <strong>{sslTargetSite.domains.join(", ")}</strong> resolves to{" "}
                  <strong className="text-emerald-400">{serverHost}</strong>.
                </div>
                <div>
                  2. Certbot will obtain a TLS certificate, configure port 443 in Nginx, and enable auto-renewal.
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-zinc-200">
                  Administrator Email for Certificate Notices *
                </label>
                <input
                  type="email"
                  required
                  value={sslEmail}
                  onChange={(e) => setSslEmail(e.target.value)}
                  placeholder="ops@yourdomain.com"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-950 font-tech"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInstallCertbot}
                  onChange={(e) => setAutoInstallCertbot(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-600"
                />
                Automatically install <code className="text-emerald-400">certbot + python3-certbot-nginx</code> if missing
              </label>

              {sslOutputLog && (
                <pre className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {sslOutputLog}
                </pre>
              )}

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSslTargetSite(null)}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-tech font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isProvisioningSsl}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-tech font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isProvisioningSsl ? (
                    <IosSpinner size="xs" className="text-white" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isProvisioningSsl ? "Running Certbot..." : "Issue & Deploy SSL Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: VIEW / EDIT NGINX CONFIG BLOCK
         ===================================================================== */}
      {inspectSite && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-steel font-bold text-base text-white">
                  /etc/nginx/sites-available/{inspectSite.filename}
                </h3>
                <p className="text-[11px] font-tech text-zinc-400">
                  Protected by automatic backup &amp; <code className="text-emerald-400">nginx -t</code> syntax rollback
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inspectEditedRaw);
                    setCopiedId("raw");
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-tech inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === "raw" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setInspectSite(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <textarea
              rows={16}
              value={inspectEditedRaw}
              onChange={(e) => setInspectEditedRaw(e.target.value)}
              className="w-full p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectSite(null)}
                className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-tech font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingRawEdit}
                onClick={handleSaveRawSiteEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-bold cursor-pointer disabled:opacity-50"
              >
                {isSavingRawEdit ? <IosSpinner size="xs" className="text-white" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Validate (`nginx -t`) &amp; Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DRAWER: NGINX ERROR / ACCESS LOGS
         ===================================================================== */}
      {logsDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="bg-zinc-950 border-l border-zinc-800 w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-steel font-bold text-white text-sm">
                  Nginx Daemon Logs ({serverName})
                </h3>
                <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs font-tech">
                  <button
                    type="button"
                    onClick={() => fetchNginxLogs("error")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      logType === "error" ? "bg-rose-500/20 text-rose-300 font-bold" : "text-zinc-400"
                    }`}
                  >
                    error.log
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchNginxLogs("access")}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      logType === "access" ? "bg-blue-500/20 text-blue-300 font-bold" : "text-zinc-400"
                    }`}
                  >
                    access.log
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogsDrawerOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap">
              {loadingLogs ? (
                <div className="py-12 text-center">
                  <IosSpinner size="md" className="mx-auto text-blue-500" />
                </div>
              ) : (
                logsText
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
