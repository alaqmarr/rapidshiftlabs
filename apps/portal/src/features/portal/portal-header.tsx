"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Building2,
  LogOut,
  LayoutDashboard,
  Receipt,
  FileText,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  KeyRound,
  Rocket,
  Code2,
  Key,
  BookOpen,
  Sparkles,
} from "lucide-react";

interface PortalHeaderProps {
  userEmail: string;
  userRole: string;
  clientId: string;
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
      { href: "/portal/billing", label: "Billing", icon: Receipt },
      { href: "/portal/contracts", label: "Contracts", icon: FileText },
    ],
  },
  {
    category: "DevOps & Ops",
    items: [
      { href: "/portal/infrastructure", label: "Fleet & PM2", icon: Server },
      { href: "/portal/domains", label: "Domains & SSL", icon: Globe },
      { href: "/portal/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    category: "Platform Services",
    items: [
      { href: "/portal/support", label: "24×7 Support", icon: LifeBuoy },
      { href: "/portal/vault", label: "Vault Secrets", icon: KeyRound },
      { href: "/portal/releases", label: "Releases", icon: Rocket },
      { href: "/portal/embeds", label: "Embed Studio", icon: Code2 },
      { href: "/portal/api-keys", label: "API Keys", icon: Key },
      { href: "/docs", label: "Documentation", icon: BookOpen },
    ],
  },
];

export function PortalHeader({ userEmail, userRole, clientId }: PortalHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
        {/* Top Branding & Account Strip */}
        <div className="h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center font-bold shadow-sm shadow-blue-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/portal"
                  className="font-steel font-extrabold text-base tracking-tight text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  RapidShift Labs
                </Link>
                <span className="steel-pill px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60">
                  Client Portal
                </span>
              </div>
              <div className="font-tech text-[11px] text-zinc-400 font-medium hidden sm:block">
                Client Operations &amp; Tenant Service Layer
              </div>
            </div>
          </div>

          {/* User Session Info & Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="font-tech text-xs font-bold text-zinc-900 dark:text-white" data-testid="client-email">
                {userEmail}
              </span>
              <div className="font-tech text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-end gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span data-testid="client-role" className="capitalize font-medium">Role: {userRole}</span>
                <span>&bull;</span>
                <span
                  data-testid="client-id"
                  className="font-tech text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60"
                >
                  {clientId}
                </span>
              </div>
            </div>

            <button
              onClick={async () => {
                try {
                  await signOut({ redirect: false }).catch(() => {});
                  await fetch("/api/auth/logout?realm=client&callbackUrl=/portal/login", {
                    method: "POST",
                    cache: "no-store",
                  });
                } finally {
                  window.location.replace("/portal/login");
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
              data-testid="client-sign-out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Segregated Categorized Navigation Bar */}
        <nav className="flex items-center gap-2 overflow-x-auto py-2 border-t border-zinc-100 dark:border-zinc-800/80 no-scrollbar text-xs">
          {SEGREGATED_CLIENT_NAV.map((group, groupIdx) => (
            <div key={group.category} className="flex items-center gap-1 shrink-0">
              {groupIdx > 0 && (
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 shrink-0" />
              )}
              {group.items.map((link) => {
                const Icon = link.icon;
                const isActive =
                  link.href === "/portal"
                    ? pathname === "/portal"
                    : pathname?.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </header>
  );
}

