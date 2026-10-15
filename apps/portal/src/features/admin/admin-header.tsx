"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Shield,
  LogOut,
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  KeyRound,
  Rocket,
  Code2,
  Settings,
  BookOpen,
} from "lucide-react";

interface AdminHeaderProps {
  userEmail: string;
  userRole: string;
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

const SEGREGATED_ADMIN_NAV: NavGroup[] = [
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
      { href: "/admin/contracts", label: "Contracts", icon: FileText },
      { href: "/admin/invoices", label: "Invoices", icon: Receipt },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    category: "Infrastructure",
    items: [
      { href: "/admin/servers", label: "Fleet", icon: Server },
      { href: "/admin/domains", label: "Domains", icon: Globe },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    category: "Platform Services",
    items: [
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
      { href: "/admin/vault", label: "Vault", icon: KeyRound },
      { href: "/admin/releases", label: "Releases", icon: Rocket },
      { href: "/admin/embeds", label: "Embeds", icon: Code2 },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/docs", label: "Docs", icon: BookOpen },
    ],
  },
];

export function AdminHeader({ userEmail, userRole }: AdminHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
        {/* Top Branding & Admin Account Strip */}
        <div className="h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-blue-950 text-white dark:bg-gradient-to-br dark:from-white dark:to-zinc-200 dark:text-zinc-900 flex items-center justify-center font-bold shadow-sm shadow-blue-500/10">
              <Shield className="w-5 h-5 text-blue-400 dark:text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin"
                  className="font-steel font-extrabold text-base tracking-tight text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  RapidShift Labs
                </Link>
                <span className="steel-pill px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700">
                  Admin Console
                </span>
              </div>
              <div className="font-tech text-[11px] text-zinc-400 font-medium hidden sm:block">
                Internal Ops • Control Panel Kernel
              </div>
            </div>
          </div>

          {/* User Session Info & Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="font-tech text-xs font-bold text-zinc-900 dark:text-white" data-testid="admin-email">
                {userEmail}
              </span>
              <span
                className="font-tech text-[11px] text-zinc-500 dark:text-zinc-400 capitalize flex items-center justify-end gap-1.5 mt-0.5 font-medium"
                data-testid="admin-role"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Role: {userRole}
              </span>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/admin/login" })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
              data-testid="admin-sign-out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Segregated Categorized Navigation Bar */}
        <nav className="flex items-center gap-2 overflow-x-auto py-2 border-t border-zinc-100 dark:border-zinc-800/80 no-scrollbar text-xs">
          {SEGREGATED_ADMIN_NAV.map((group, groupIdx) => (
            <div key={group.category} className="flex items-center gap-1 shrink-0">
              {groupIdx > 0 && (
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1.5 shrink-0" />
              )}
              {group.items.map((link) => {
                const Icon = link.icon;
                const isActive =
                  link.href === "/admin"
                    ? pathname === "/admin"
                    : pathname?.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-zinc-900 to-blue-950 dark:from-white dark:to-zinc-200 text-white dark:text-zinc-900 font-semibold shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white dark:text-zinc-900" : "text-zinc-400"}`} />
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

