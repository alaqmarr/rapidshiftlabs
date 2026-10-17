"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  Home,
  Shield,
  Activity,
  LifeBuoy,
  BookOpen,
  Terminal,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

export type SystemStateTone = "blue" | "amber" | "rose" | "purple" | "emerald";

export interface SystemStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: React.ComponentType<{ className?: string }>;
  external?: boolean;
}

export interface SystemStateMetric {
  label: string;
  value: string;
  status?: "ok" | "warn" | "err" | "neutral";
}

export interface SystemStateShellProps {
  httpCode: string;
  badgeLabel: string;
  tone?: SystemStateTone;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: SystemStateAction[];
  metrics?: SystemStateMetric[];
  traceId?: string;
  technicalDetail?: string;
  children?: React.ReactNode;
  compact?: boolean;
  showHeader?: boolean;
}

const TONE_STYLES: Record<
  SystemStateTone,
  {
    glow: string;
    pill: string;
    dot: string;
    iconBox: string;
    codeGradient: string;
    borderAccent: string;
  }
> = {
  blue: {
    glow: "from-blue-600/15 via-indigo-500/5 to-transparent",
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
    dot: "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]",
    iconBox:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25 shadow-blue-500/5",
    codeGradient:
      "from-blue-600 via-indigo-500 to-cyan-500 dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-300",
    borderAccent: "border-blue-500/20",
  },
  amber: {
    glow: "from-amber-500/15 via-orange-500/5 to-transparent",
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    dot: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]",
    iconBox:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shadow-amber-500/5",
    codeGradient:
      "from-amber-500 via-orange-500 to-yellow-500 dark:from-amber-400 dark:via-orange-300 dark:to-yellow-300",
    borderAccent: "border-amber-500/20",
  },
  rose: {
    glow: "from-rose-600/15 via-red-500/5 to-transparent",
    pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
    dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]",
    iconBox:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 shadow-rose-500/5",
    codeGradient:
      "from-rose-600 via-red-500 to-orange-500 dark:from-rose-400 dark:via-red-400 dark:to-orange-300",
    borderAccent: "border-rose-500/20",
  },
  purple: {
    glow: "from-purple-600/15 via-fuchsia-500/5 to-transparent",
    pill: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
    dot: "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]",
    iconBox:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25 shadow-purple-500/5",
    codeGradient:
      "from-purple-600 via-fuchsia-500 to-indigo-500 dark:from-purple-400 dark:via-fuchsia-300 dark:to-indigo-300",
    borderAccent: "border-purple-500/20",
  },
  emerald: {
    glow: "from-emerald-600/15 via-teal-500/5 to-transparent",
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]",
    iconBox:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 shadow-emerald-500/5",
    codeGradient:
      "from-emerald-600 via-teal-500 to-cyan-500 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-300",
    borderAccent: "border-emerald-500/20",
  },
};

export function SystemStateShell({
  httpCode,
  badgeLabel,
  tone = "blue",
  title,
  subtitle,
  icon: Icon,
  actions,
  metrics,
  traceId,
  technicalDetail,
  children,
  compact = false,
  showHeader = true,
}: SystemStateShellProps) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [copiedTrace, setCopiedTrace] = useState(false);
  const [timestampStr, setTimestampStr] = useState<string>("");

  const resolvedTraceId =
    traceId || `RSL-${httpCode}-${Math.abs(hashCode(pathname)).toString(16).toUpperCase().slice(0, 6)}`;

  useEffect(() => {
    setTimestampStr(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  const style = TONE_STYLES[tone];

  const isAdminRealm = pathname.startsWith("/admin");
  const isPortalRealm = pathname.startsWith("/portal");
  const primaryHomeHref = isAdminRealm ? "/admin" : isPortalRealm ? "/portal" : "/";
  const primaryHomeLabel = isAdminRealm
    ? "Admin Command Center"
    : isPortalRealm
      ? "Client Portal Overview"
      : "Control Plane Home";

  const resolvedActions: SystemStateAction[] =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: primaryHomeLabel,
            href: primaryHomeHref,
            variant: "primary",
            icon: Home,
          },
          {
            label: "Go Back",
            onClick: () => router.back(),
            variant: "secondary",
            icon: ArrowLeft,
          },
          {
            label: "System Status",
            href: "/status/system",
            variant: "ghost",
            icon: Activity,
          },
        ];

  const handleCopyTrace = () => {
    navigator.clipboard.writeText(
      `Trace: ${resolvedTraceId} | Code: ${httpCode} | Path: ${pathname} | Time: ${timestampStr}`,
    );
    setCopiedTrace(true);
    setTimeout(() => setCopiedTrace(false), 2000);
  };

  return (
    <div
      className={`${
        compact ? "min-h-[calc(100vh-5rem)]" : "min-h-screen"
      } relative flex flex-col bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-600 selection:text-white overflow-hidden`}
    >
      {/* Subtle Ambient Background Grid & Radial Glow */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b ${style.glow} opacity-90`}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Optional Top Application Header */}
      {showHeader && (
        <header className="relative z-20 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <Link href={primaryHomeHref} className="flex items-center gap-2.5 group">
              <RapidShiftLogo size={32} />
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                  RapidShift<span className="text-blue-600 dark:text-blue-400">Labs</span>
                </span>
                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wider uppercase mt-0.5">
                  Service Layer &amp; Control Plane
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/status/system"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Platform Status</span>
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">Docs</span>
              </Link>
              <Link
                href={isAdminRealm ? "/admin/support" : "/portal/support"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>Support Desk</span>
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="w-full max-w-3xl space-y-6">
          {/* Primary Hero Card */}
          <div className="bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/90 dark:border-zinc-800/90 rounded-3xl p-6 sm:p-10 shadow-xl backdrop-blur-md space-y-7">
            {/* Top Status Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${style.pill}`}
              >
                <span className={`w-2 h-2 rounded-full animate-pulse ${style.dot}`} />
                <span className="font-mono uppercase tracking-wider">{badgeLabel}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60">
                  HTTP {httpCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyTrace}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 transition cursor-pointer"
                  title="Copy diagnostic reference"
                >
                  {copiedTrace ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{resolvedTraceId}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Icon + Title + Watermark Code */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
              <div className="flex items-start gap-4 sm:gap-5">
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border flex items-center justify-center shrink-0 shadow-lg ${style.iconBox}`}
                >
                  <Icon className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                    {title}
                  </h1>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                    {subtitle}
                  </p>
                </div>
              </div>

              <div
                className={`hidden md:block text-5xl font-black font-mono tracking-tighter bg-gradient-to-br ${style.codeGradient} bg-clip-text text-transparent select-none shrink-0 opacity-90`}
              >
                {httpCode}
              </div>
            </div>

            {/* Optional Telemetry Strip */}
            {metrics && metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {metrics.map((m, idx) => {
                  const statusDot =
                    m.status === "ok"
                      ? "bg-emerald-500"
                      : m.status === "warn"
                        ? "bg-amber-500"
                        : m.status === "err"
                          ? "bg-rose-500"
                          : "bg-blue-500";
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {m.label}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {m.status && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />}
                        <span className="truncate">{m.value}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Body Slot (e.g. Settlement Bank/UPI Card, Subsystem Status, Error Digest) */}
            {children && <div className="pt-1">{children}</div>}

            {/* Technical Detail / Path Diagnostic Box */}
            <div className="p-3.5 rounded-2xl bg-zinc-100/80 dark:bg-zinc-950/90 border border-zinc-200/80 dark:border-zinc-800/90 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">
                  {technicalDetail || `Requested route: ${pathname}`}
                </span>
              </div>
              {timestampStr && (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
                  {timestampStr}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {resolvedActions.map((act, idx) => {
                const ActIcon = act.icon;
                const btnClasses =
                  act.variant === "primary"
                    ? "bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow-sm shadow-blue-600/20"
                    : act.variant === "danger"
                      ? "bg-rose-600 hover:bg-rose-500 text-white border-transparent shadow-sm shadow-rose-600/20"
                      : act.variant === "secondary"
                        ? "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                        : "bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 border-zinc-200/70 dark:border-zinc-800";

                if (act.href) {
                  return (
                    <Link
                      key={idx}
                      href={act.href}
                      target={act.external ? "_blank" : undefined}
                      rel={act.external ? "noopener noreferrer" : undefined}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer ${btnClasses}`}
                    >
                      {ActIcon && <ActIcon className="w-4 h-4" />}
                      <span>{act.label}</span>
                      {act.external && <ExternalLink className="w-3.5 h-3.5 opacity-70" />}
                    </Link>
                  );
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={act.onClick}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer ${btnClasses}`}
                  >
                    {ActIcon && <ActIcon className="w-4 h-4" />}
                    <span>{act.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Quick Navigation Directory */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <Link
              href="/admin"
              className="p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-blue-500/40 transition flex items-center justify-between group"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  Admin Console
                </div>
                <div className="text-[11px] text-zinc-400">Control Plane</div>
              </div>
              <Shield className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition" />
            </Link>

            <Link
              href="/portal"
              className="p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-blue-500/40 transition flex items-center justify-between group"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  Client Portal
                </div>
                <div className="text-[11px] text-zinc-400">Tenant Workspace</div>
              </div>
              <Home className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition" />
            </Link>

            <Link
              href="/status/system"
              className="p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-blue-500/40 transition flex items-center justify-between group"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  Live Status
                </div>
                <div className="text-[11px] text-zinc-400">Uptime &amp; SLA</div>
              </div>
              <Activity className="w-4 h-4 text-emerald-500" />
            </Link>

            <Link
              href="/docs"
              className="p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-blue-500/40 transition flex items-center justify-between group"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  Developer Docs
                </div>
                <div className="text-[11px] text-zinc-400">SDK &amp; Embeds</div>
              </div>
              <BookOpen className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
