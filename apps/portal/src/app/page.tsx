import Link from "next/link";
import { ArrowRight, ShieldCheck, Activity, Terminal, ExternalLink } from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-zinc-950 text-white selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <RapidShiftLogo size={34} showWordmark={true} />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/resources"
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              Resources &amp; Runbooks
            </Link>
            <Link
              href="/docs"
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              Docs &amp; API
            </Link>
            <Link
              href="/admin/login"
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              Admin Console
            </Link>
            <Link
              href="/portal/login"
              className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/30 transition"
            >
              Client Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 xl:px-10 py-16 sm:py-24 text-center w-full space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-300 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span>RapidShift Labs Control Panel • Production Node</span>
        </div>

        <div className="space-y-4 max-w-4xl">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-tight sm:leading-none">
            Reliable Operations &bull;{" "}
            <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-400 bg-clip-text text-transparent">
              Access Gating &bull; Fleet Control
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-3xl mx-auto pt-2">
            The unified control panel for internal business operations and client service delivery.
            Real-time billing, automated dunning access gates, scoped PM2 management, 24&times;7 SLA support, and cookieless telemetry.
          </p>
        </div>

        {/* Portals CTA Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl pt-4">
          <Link
            href="/admin/login"
            className="group relative p-7 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 hover:border-blue-500/50 text-left transition-all duration-200 flex flex-col justify-between hover:bg-zinc-900 hover:shadow-lg hover:shadow-blue-500/5"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold group-hover:text-blue-400 transition flex items-center justify-between">
                Admin Console
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition text-blue-400" />
              </h2>
              <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed">
                Manage clients, contracts, billing cycles, GST invoicing, SMTP credentials, and team users.
              </p>
            </div>
            <div className="mt-7 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-zinc-300 group-hover:text-blue-400 transition">
              <span>Sign In (Email + Password)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href="/portal/login"
            className="group relative p-7 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 hover:border-blue-500/50 text-left transition-all duration-200 flex flex-col justify-between hover:bg-zinc-900 hover:shadow-lg hover:shadow-blue-500/5"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition">
                <Activity className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold group-hover:text-blue-400 transition flex items-center justify-between">
                Client Portal
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition text-blue-400" />
              </h2>
              <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed">
                View live dues, access gate status, mapped PM2 fleet restart &amp; logs, and 24&times;7 support tickets.
              </p>
            </div>
            <div className="mt-7 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-blue-400 group-hover:text-blue-300 transition">
              <span>Client Sign In (Dedicated URL)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>

        {/* Documentation Hub Prompt */}
        <div className="pt-2">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition group border border-zinc-800 rounded-full px-5 py-2 bg-zinc-900/60 hover:border-blue-500/40"
          >
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span>Explore Integration Guides, SDKs &amp; OpenAPI 3.1 Spec</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition text-blue-400" />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-6 px-4 sm:px-6 lg:px-8 xl:px-10 w-full flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <RapidShiftLogo size={18} />
          <span>&copy; {new Date().getFullYear()} RapidShift Labs. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <Link href="/docs" className="hover:text-white transition">Docs</Link>
          <Link href="/docs/api" className="hover:text-white transition">API Reference</Link>
          <Link href="/openapi.json" target="_blank" className="hover:text-white transition flex items-center gap-1">
            <span>OpenAPI Spec</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
