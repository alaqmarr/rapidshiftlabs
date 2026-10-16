"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Building2,
  LayoutDashboard,
  Receipt,
  FileText,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  Key,
  Rocket,
  Code2,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";
import { SmartCommandPalette } from "@/components/smart/command-palette";

interface PortalShellProps {
  userEmail: string;
  userRole: string;
  clientId: string;
  clientName?: string;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  category: string;
  items: NavItem[];
}

const SEGREGATED_CLIENT_NAV: NavGroup[] = [
  {
    category: "Main",
    items: [
      { href: "/portal", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    category: "Finance",
    items: [
      { href: "/portal/billing", label: "Billing & Invoices", icon: Receipt },
      { href: "/portal/contracts", label: "Contracts & SLA", icon: FileText },
    ],
  },
  {
    category: "Infrastructure",
    items: [
      { href: "/portal/infrastructure", label: "Fleet & PM2", icon: Server },
      { href: "/portal/domains", label: "Domains & SSL", icon: Globe },
      { href: "/portal/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    category: "Platform Services",
    items: [
      { href: "/portal/support", label: "Support Desk", icon: LifeBuoy },
      { href: "/portal/vault", label: "Vault Secrets", icon: Key },
      { href: "/portal/releases", label: "Releases", icon: Rocket },
      { href: "/portal/embeds", label: "Embed Studio", icon: Code2 },
      { href: "/portal/api-keys", label: "API Keys & Gate", icon: ShieldCheck },
      { href: "/resources", label: "Resources", icon: BookOpen },
      { href: "/docs", label: "Docs", icon: ExternalLink },
    ],
  },
];

const ALL_CLIENT_NAV_ITEMS = SEGREGATED_CLIENT_NAV.flatMap((g) => g.items);

export function PortalShell({
  userEmail,
  userRole,
  clientId,
  clientName,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ redirect: false }).catch(() => {});
      await fetch("/api/auth/logout?realm=client&callbackUrl=/portal/login", {
        method: "POST",
        cache: "no-store",
      });
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      window.location.replace("/portal/login");
    }
  };

  const currentItem = ALL_CLIENT_NAV_ITEMS.find((item) =>
    item.href === "/portal"
      ? pathname === "/portal"
      : pathname?.startsWith(item.href)
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-500 selection:text-white">
      {/* Top Application Shell Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl shadow-xs transition-colors">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Left: Brand + Org Context */}
            <div className="flex items-center gap-3">
              {/* Mobile menu trigger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-hidden"
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <Link
                href="/portal"
                className="flex items-center gap-2.5 group transition-transform active:scale-98"
              >
                <RapidShiftLogo size={34} />
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                    {clientName || "Client Portal"}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wider uppercase mt-0.5">
                    RapidShift Service Layer
                  </span>
                </div>
              </Link>

              {/* Breadcrumb separator on desktop */}
              {currentItem && currentItem.href !== "/portal" && (
                <div className="hidden sm:flex items-center gap-2 text-zinc-400 dark:text-zinc-600 ml-2">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {currentItem.label}
                  </span>
                </div>
              )}
            </div>

            {/* Center-Right: Access Gate Status & User Session Profile */}
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <SmartCommandPalette realm="client" />

              {/* Live Gate Status Pill */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span>Access Gate: Active</span>
              </div>

              {/* Resources Runbooks Link */}
              <Link
                href="/resources"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition"
                title="Operational Runbooks & Live Embeds"
              >
                <BookOpen className="w-3.5 h-3.5 opacity-70" />
                <span>Resources</span>
              </Link>

              {/* User Account Chip */}
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-zinc-200 dark:border-zinc-800">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight" data-testid="client-email">
                    {userEmail}
                  </span>
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 capitalize flex items-center justify-end gap-1.5">
                    <span data-testid="client-role">{userRole === "client_admin" ? "Org Admin" : "Member"}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-[9px] text-zinc-400">{clientId.slice(0, 10)}...</span>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg border border-zinc-200 dark:border-zinc-700 transition cursor-pointer disabled:opacity-50"
                  title="Sign out of Client Portal"
                  data-testid="client-sign-out"
                >
                  <LogOut className={`w-3.5 h-3.5 ${isSigningOut ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Segregated Horizontal Navigation Bar */}
        <div className="hidden lg:block border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
            <nav className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar text-xs" aria-label="Client Portal Navigation">
              {SEGREGATED_CLIENT_NAV.map((group, groupIdx) => (
                <div key={group.category} className="flex items-center gap-1 shrink-0">
                  {groupIdx > 0 && (
                    <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 shrink-0" />
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/portal"
                        ? pathname === "/portal"
                        : pathname?.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                          isActive
                            ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-blue-500/20 font-semibold"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Mobile Navigation Drawer with Segregated Categories */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
            {SEGREGATED_CLIENT_NAV.map((group) => (
              <div key={group.category} className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2">
                  {group.category}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/portal"
                        ? pathname === "/portal"
                        : pathname?.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${
                          isActive
                            ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-800"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <Icon className="w-4 h-4 text-blue-500" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col w-full">
        {children}
      </div>

      {/* Modern Compact Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 py-4 mt-auto">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">RapidShift Client Service Layer</span>
            <span>&bull;</span>
            <span>Dedicated Tenant Access</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span>Fail-Open Architecture</span>
            <span>&bull;</span>
            <Link href="/portal/support" className="hover:underline">Open Ticket</Link>
            <span>&bull;</span>
            <Link href="/portal/embeds" className="hover:underline">Embed Code</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
