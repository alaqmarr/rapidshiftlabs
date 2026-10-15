"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Code2,
  Terminal,
  Layers,
  ExternalLink,
  Sparkles,
  Key,
} from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

export function DocsHeader() {
  const pathname = usePathname();

  const navItems = [
    { href: "/docs", label: "Overview & Quickstart", exact: true },
    { href: "/docs/embeds", label: "Embeds & Web Components" },
    { href: "/docs/analytics-tracker", label: "Analytics Tracker" },
    { href: "/docs/gate-integration", label: "Access Gate" },
    { href: "/docs/sdk-reference", label: "TypeScript SDK" },
    { href: "/docs/webhooks", label: "Webhooks" },
    { href: "/docs/api", label: "REST API Reference" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand + Badge */}
          <div className="flex items-center gap-3">
            <Link href="/docs" className="flex items-center gap-2.5 group">
              <RapidShiftLogo size={32} />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                    RapidShift<span className="text-blue-600 dark:text-blue-400">Labs</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                    Developers
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                  rsl.alaqmar.dev &bull; v1.0
                </span>
              </div>
            </Link>
          </div>

          {/* Right Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Link
              href="/resources"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Runbooks &amp; Sandbox</span>
            </Link>
            <Link
              href="/portal/api-keys"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Get Universal API Key</span>
              <span className="sm:hidden">API Key</span>
            </Link>
            <Link
              href="/portal"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition"
            >
              Client Portal
            </Link>
          </div>
        </div>

        {/* Sub-navigation Bar */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 border-t border-zinc-100 dark:border-zinc-900 no-scrollbar text-xs font-semibold">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
