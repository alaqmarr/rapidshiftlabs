"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Shield,
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
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

interface AdminShellProps {
  userEmail: string;
  userRole: string;
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

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
  superadmin: { label: "SuperAdmin", className: "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  finance: { label: "Finance", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  ops: { label: "Operations", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  support: { label: "Support", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800" },
};

function getFilteredNav(role: string): NavGroup[] {
  const isSuper = role === "owner" || role === "superadmin";
  const isFinance = role === "finance";
  const isOps = role === "ops";
  const isSupport = role === "support";

  return [
    {
      category: "Main",
      items: [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      category: "Commercial",
      items: [
        { href: "/admin/clients", label: "Clients", icon: Users },
        ...(!isOps && !isSupport
          ? [
              { href: "/admin/contracts", label: "Contracts", icon: FileText },
              { href: "/admin/invoices", label: "Invoices", icon: Receipt },
              { href: "/admin/payments", label: "Payments", icon: CreditCard },
            ]
          : []),
      ],
    },
    ...(!isFinance
      ? [
          {
            category: "Infrastructure",
            items: [
              { href: "/admin/servers", label: "Fleet & PM2", icon: Server },
              { href: "/admin/domains", label: "Domains & SSL", icon: Globe },
              ...(!isSupport ? [{ href: "/admin/analytics", label: "Analytics", icon: BarChart3 }] : []),
            ],
          },
        ]
      : [
          {
            category: "Infrastructure",
            items: [
              { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
            ],
          },
        ]),
    {
      category: "Platform Services",
      items: [
        { href: "/admin/support", label: "Support Desk", icon: LifeBuoy },
        ...(!isFinance && !isSupport
          ? [
              { href: "/admin/vault", label: "Vault", icon: Key },
              { href: "/admin/releases", label: "Releases", icon: Rocket },
              { href: "/admin/embeds", label: "Embed Studio", icon: Code2 },
            ]
          : []),
        { href: "/resources", label: "Resources", icon: BookOpen },
        ...(isSuper ? [{ href: "/admin/team", label: "Team & Staff", icon: Users }] : []),
        ...(isSuper || isFinance ? [{ href: "/admin/settings", label: "Settings", icon: Settings }] : []),
      ],
    },
  ].filter((group) => group.items.length > 0);
}

export function AdminShell({ userEmail, userRole, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const segregatedNav = getFilteredNav(userRole);
  const allNavItems = segregatedNav.flatMap((g) => g.items);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ redirect: false }).catch(() => {});
      await fetch("/api/auth/logout?realm=admin&callbackUrl=/admin/login", {
        method: "POST",
        cache: "no-store",
      });
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      window.location.replace("/admin/login");
    }
  };

  // Compute active item for breadcrumb
  const currentItem = allNavItems.find((item) =>
    item.href === "/admin"
      ? pathname === "/admin"
      : pathname?.startsWith(item.href)
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-500 selection:text-white">
      {/* Top Application Shell Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl shadow-xs transition-colors">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Left: Brand + Breadcrumb */}
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
                href="/admin"
                className="flex items-center gap-2.5 group transition-transform active:scale-98"
              >
                <RapidShiftLogo size={34} />
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                    RapidShift<span className="text-blue-600 dark:text-blue-400">Labs</span>
                  </span>
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wider uppercase mt-0.5">
                    Control Panel
                  </span>
                </div>
              </Link>

              {/* Breadcrumb separator on desktop */}
              {currentItem && currentItem.href !== "/admin" && (
                <div className="hidden sm:flex items-center gap-2 text-zinc-400 dark:text-zinc-600 ml-2">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {currentItem.label}
                  </span>
                </div>
              )}
            </div>

            {/* Center-Right: System Health Pulse & User Session Profile */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Live engine badge */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="font-mono tracking-tight">WAL Live</span>
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

              {/* Client Portal Link */}
              <Link
                href="/portal"
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition"
                title="Preview Client Portal"
              >
                <span>Client Portal</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Link>

              {/* User Account Chip */}
              <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-zinc-200 dark:border-zinc-800">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight" data-testid="admin-email">
                    {userEmail}
                  </span>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${ROLE_BADGES[userRole]?.className || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      {ROLE_BADGES[userRole]?.label || userRole}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg border border-zinc-200 dark:border-zinc-700 transition cursor-pointer disabled:opacity-50"
                  title="Sign out of Admin Console"
                  data-testid="admin-sign-out"
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
            <nav className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar text-xs" aria-label="Admin Navigation">
              {segregatedNav.map((group, groupIdx) => (
                <div key={group.category} className="flex items-center gap-1 shrink-0">
                  {groupIdx > 0 && (
                    <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 shrink-0" />
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/admin"
                        ? pathname === "/admin"
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
            {segregatedNav.map((group) => (
              <div key={group.category} className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2">
                  {group.category}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/admin"
                        ? pathname === "/admin"
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
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">RapidShift Labs Control Panel</span>
            <span>&bull;</span>
            <span>Self-Hosted Production Node</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span>SQLite libSQL WAL</span>
            <span>&bull;</span>
            <Link href="/status/system" className="hover:underline">System Status</Link>
            <span>&bull;</span>
            <Link href="/embed/billing-summary" target="_blank" className="hover:underline">Embed Preview</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
