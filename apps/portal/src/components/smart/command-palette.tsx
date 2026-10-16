"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Command,
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  Key,
  Rocket,
  Code2,
  BookOpen,
  Settings,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  X,
  RefreshCw,
} from "lucide-react";
import type { CommandPaletteEntityItem } from "@/app/api/v1/smart/command-palette/route";

interface SmartCommandPaletteProps {
  realm: "admin" | "client";
}

interface StaticNavCommand {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_STATIC_COMMANDS: StaticNavCommand[] = [
  {
    id: "nav_admin_dash",
    label: "Command Center Dashboard",
    subtitle: "Executive telemetry, Next Best Actions, 30/60/90d forecast & correlated incidents",
    href: "/admin",
    keywords: "dashboard home overview health",
    icon: LayoutDashboard,
  },
  {
    id: "nav_admin_clients",
    label: "Clients Directory & Onboarding",
    subtitle: "Manage client organizations, health scores & initial contract tenure",
    href: "/admin/clients",
    keywords: "clients tenants organizations onboard",
    icon: Users,
  },
  {
    id: "nav_admin_contracts",
    label: "Contracts & Tenure Autopilot",
    subtitle: "One-Time vs Date Range contracts, TCV, renewal roll-forward & ARR",
    href: "/admin/contracts",
    keywords: "contracts retainers sla tenure renewal",
    icon: FileText,
  },
  {
    id: "nav_admin_invoices",
    label: "Invoices & GST Ledger",
    subtitle: "Receivables, aging buckets, CGST/SGST/IGST & PDF generation",
    href: "/admin/invoices",
    keywords: "invoices billing gst tax overdue",
    icon: Receipt,
  },
  {
    id: "nav_admin_payments",
    label: "Payments & Reconciliation",
    subtitle: "Record UPI/NEFT/RTGS/Wire settlements & payment velocity",
    href: "/admin/payments",
    keywords: "payments collections receipts",
    icon: CreditCard,
  },
  {
    id: "nav_admin_servers",
    label: "Fleet & PM2 Operations",
    subtitle: "SSH servers, PM2 processes, crash detection, logs & self-healing",
    href: "/admin/servers",
    keywords: "fleet servers pm2 ssh logs restart",
    icon: Server,
  },
  {
    id: "nav_admin_domains",
    label: "Domains & SSL Monitoring",
    subtitle: "HTTP uptime, SSL expiry countdowns, DNS drift & RDAP",
    href: "/admin/domains",
    keywords: "domains ssl certificates uptime dns",
    icon: Globe,
  },
  {
    id: "nav_admin_support",
    label: "Support SLA Desk",
    subtitle: "24/7 SLA queue, live telemetry snapshots & L1/L2/L3 escalation",
    href: "/admin/support",
    keywords: "support tickets sla helpdesk",
    icon: LifeBuoy,
  },
  {
    id: "nav_admin_analytics",
    label: "Analytics & Web Vitals",
    subtitle: "Cookieless traffic, core web vitals, UTM & signed offload",
    href: "/admin/analytics",
    keywords: "analytics traffic events vitals",
    icon: BarChart3,
  },
  {
    id: "nav_admin_vault",
    label: "Encrypted Credential Vault",
    subtitle: "AES-256-GCM secrets, audited reveal & password generator",
    href: "/admin/vault",
    keywords: "vault credentials secrets passwords",
    icon: Key,
  },
  {
    id: "nav_admin_releases",
    label: "Release Hub & Artifacts",
    subtitle: "Production & Beta deployments, changelogs & GitHub sync",
    href: "/admin/releases",
    keywords: "releases deployments github changelog",
    icon: Rocket,
  },
  {
    id: "nav_admin_embeds",
    label: "Embed Studio",
    subtitle: "23 live client-facing widgets via Web Component or iFrame",
    href: "/admin/embeds",
    keywords: "embeds widgets iframe web component",
    icon: Code2,
  },
  {
    id: "nav_admin_resources",
    label: "Operational Runbooks & Resources",
    subtitle: "Architecture guides, deployment runbooks & API documentation",
    href: "/resources",
    keywords: "resources docs runbooks documentation",
    icon: BookOpen,
  },
  {
    id: "nav_admin_settings",
    label: "Platform & GST Settings",
    subtitle: "Legal entity, GSTIN, bank details, SMTP & security",
    href: "/admin/settings",
    keywords: "settings config gst smtp bank",
    icon: Settings,
  },
];

const CLIENT_STATIC_COMMANDS: StaticNavCommand[] = [
  {
    id: "nav_portal_home",
    label: "Client Overview & Monthly Digest",
    subtitle: "Live health score, contract tenure, monthly executive report & quick actions",
    href: "/portal",
    keywords: "overview dashboard home digest report",
    icon: LayoutDashboard,
  },
  {
    id: "nav_portal_billing",
    label: "Billing, Invoices & Settlement",
    subtitle: "Download GST invoices, check balance due & access gate status",
    href: "/portal/billing",
    keywords: "billing invoices payment gst pdf",
    icon: Receipt,
  },
  {
    id: "nav_portal_contracts",
    label: "Contracts & Calculated Tenure",
    subtitle: "Active engagement tenure, date range, TCV & next billing date",
    href: "/portal/contracts",
    keywords: "contracts sla retainer tenure",
    icon: FileText,
  },
  {
    id: "nav_portal_infra",
    label: "Fleet & PM2 Processes",
    subtitle: "Restart mapped PM2 processes, inspect live logs & run AI diagnostics",
    href: "/portal/infrastructure",
    keywords: "fleet pm2 servers processes logs restart",
    icon: Server,
  },
  {
    id: "nav_portal_domains",
    label: "Domains & SSL Health",
    subtitle: "Monitor HTTP uptime, SSL expiry & verify endpoints on demand",
    href: "/portal/domains",
    keywords: "domains ssl certificates uptime",
    icon: Globe,
  },
  {
    id: "nav_portal_support",
    label: "Support Desk & SLA Escalation",
    subtitle: "Raise tickets with automatic system telemetry snapshots",
    href: "/portal/support",
    keywords: "support tickets help escalate",
    icon: LifeBuoy,
  },
  {
    id: "nav_portal_vault",
    label: "Shared Credential Vault",
    subtitle: "Audited reveal of shared server, database & API secrets",
    href: "/portal/vault",
    keywords: "vault secrets credentials passwords",
    icon: Key,
  },
  {
    id: "nav_portal_releases",
    label: "Releases & Preview Links",
    subtitle: "Track production & beta deployments and changelogs",
    href: "/portal/releases",
    keywords: "releases deployments changelog",
    icon: Rocket,
  },
  {
    id: "nav_portal_embeds",
    label: "Embed Studio",
    subtitle: "Copy-paste live widgets into your own admin dashboard",
    href: "/portal/embeds",
    keywords: "embeds widgets iframe",
    icon: Code2,
  },
  {
    id: "nav_portal_apikeys",
    label: "API Keys & Access Gate SDK",
    subtitle: "Manage rsl_live_... API keys for middleware gate & embeds",
    href: "/portal/api-keys",
    keywords: "api keys sdk access gate",
    icon: ShieldCheck,
  },
];

export function SmartCommandPalette({ realm }: SmartCommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<CommandPaletteEntityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const staticCommands = realm === "admin" ? ADMIN_STATIC_COMMANDS : CLIENT_STATIC_COMMANDS;

  const fetchLiveEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/smart/command-palette", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setEntities(data.items);
        }
      }
    } catch {
      // Non-fatal fallback to static commands
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      fetchLiveEntities();
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open, fetchLiveEntities]);

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedNav = staticCommands
      .filter(
        (cmd) =>
          !q ||
          cmd.label.toLowerCase().includes(q) ||
          cmd.subtitle.toLowerCase().includes(q) ||
          cmd.keywords.toLowerCase().includes(q),
      )
      .map((cmd) => ({
        id: cmd.id,
        group: "Navigation & Suites",
        title: cmd.label,
        subtitle: cmd.subtitle,
        badge: "SUITE",
        badgeTone: "zinc" as const,
        href: cmd.href,
        icon: cmd.icon,
      }));

    const categoryIcon = (cat: CommandPaletteEntityItem["category"]) => {
      switch (cat) {
        case "client":
          return Users;
        case "contract":
          return FileText;
        case "invoice":
          return Receipt;
        case "process":
          return Server;
        case "domain":
          return Globe;
        case "ticket":
          return LifeBuoy;
        default:
          return Rocket;
      }
    };

    const matchedEntities = entities
      .filter(
        (item) =>
          !q ||
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q),
      )
      .slice(0, q ? 25 : 12)
      .map((item) => ({
        id: item.id,
        group: "Live Control Plane Entities",
        title: item.title,
        subtitle: item.subtitle,
        badge: item.badge || item.category.toUpperCase(),
        badgeTone: item.badgeTone || ("blue" as const),
        href: item.href,
        icon: categoryIcon(item.category),
      }));

    return q ? [...matchedEntities, ...matchedNav] : [...matchedNav.slice(0, 6), ...matchedEntities];
  }, [query, staticCommands, entities]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredResults.length > 0 ? (prev + 1) % filteredResults.length : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredResults.length > 0
          ? (prev - 1 + filteredResults.length) % filteredResults.length
          : 0,
      );
    } else if (e.key === "Enter" && filteredResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredResults[selectedIndex].href);
    }
  };

  const badgeToneClass = (tone?: string) => {
    switch (tone) {
      case "emerald":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "amber":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "rose":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "blue":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      default:
        return "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700";
    }
  };

  return (
    <>
      {/* Trigger Pill in Top Bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 transition cursor-pointer shadow-2xs"
        title="Open Smart Command Palette (Ctrl+K / Cmd+K)"
        data-testid="smart-command-palette-trigger"
      >
        <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span className="hidden xl:inline text-zinc-500 dark:text-zinc-400">
          Jump to client, contract, PM2, domain...
        </span>
        <span className="xl:hidden">Search</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  realm === "admin"
                    ? "Search clients, contracts, tenure, invoices #, PM2 processes, SSL domains, tickets..."
                    : "Search contracts, invoices #, PM2 processes, domains, tickets, or jump to suite..."
                }
                className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden"
              />
              {loading && <RefreshCw className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-[62vh] overflow-y-auto p-2 divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredResults.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    No matching entities or commands found
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Try searching by client name, contract code, invoice number, hostname, or PM2 process name.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredResults.map((item, idx) => {
                    const Icon = item.icon;
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => handleSelect(item.href)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                          isSelected
                            ? "bg-blue-50/90 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{item.title}</div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {item.subtitle}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badgeToneClass(
                              item.badgeTone,
                            )}`}
                          >
                            {item.badge}
                          </span>
                          <ArrowRight
                            className={`w-3.5 h-3.5 transition-transform ${
                              isSelected ? "translate-x-0.5 text-blue-600 dark:text-blue-400" : "text-zinc-300 dark:text-zinc-600"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Shortcuts */}
            <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950/70 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-mono">
                    ↑↓
                  </kbd>{" "}
                  Navigate
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-mono">
                    ↵
                  </kbd>{" "}
                  Open
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-mono">
                    Esc
                  </kbd>{" "}
                  Close
                </span>
              </div>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                RapidShift Smart Copilot Index ({entities.length} live entities)
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
