"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  CreditCard,
  Layers,
  ShieldCheck,
  RefreshCw,
  Search,
  Printer,
  Calendar,
  TrendingUp,
  Check,
  X,
  Download,
  Award,
} from "lucide-react";
import { formatCurrency as kernelFormatCurrency } from "@/lib/currency";

export interface ContractItem {
  id: string;
  code: string;
  title: string;
  clientId: string;
  status: "draft" | "active" | "renewed" | "expired" | "terminated";
  amountMinor: number;
  currency: string;
  billingCycle: string;
  intervalCount: number;
  anchorDay: number;
  validFrom: number;
  validTo: number;
  autoRenew: boolean;
  taxProfile: string;
  notes?: string;
  createdAt: number;
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    amountMinor: number;
  }>;
}

export interface ClientData {
  id: string;
  name: string;
  billingEmail?: string;
  currency?: string;
}

interface PortalContractsViewProps {
  client: ClientData | null;
  contracts: ContractItem[];
}

export function PortalContractsView({ client, contracts }: PortalContractsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [summaryModalContract, setSummaryModalContract] = useState<ContractItem | null>(null);
  const [now] = useState(() => Date.now());

  const formatCurrency = (minor: number, curr = "INR") => {
    return kernelFormatCurrency(minor, curr);
  };

  const formatDate = (ms: number | string | undefined) => {
    if (!ms) return "—";
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const getMonthlyNormalizedMinor = (c: ContractItem): number => {
    const interval = Math.max(1, c.intervalCount || 1);
    switch (c.billingCycle.toLowerCase()) {
      case "monthly":
        return Math.round(c.amountMinor / interval);
      case "quarterly":
        return Math.round(c.amountMinor / (3 * interval));
      case "half_yearly":
        return Math.round(c.amountMinor / (6 * interval));
      case "yearly":
        return Math.round(c.amountMinor / (12 * interval));
      case "one_time":
      default:
        return c.amountMinor;
    }
  };

  const getTenureStats = (c: ContractItem) => {
    const start = c.validFrom || c.createdAt || now;
    const end = c.validTo || start + 365 * 86400000;
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((now - start) / 86400000)));
    const remainingDays = Math.max(0, Math.ceil((end - now) / 86400000));
    const pct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
    return { totalDays, elapsedDays, remainingDays, pct };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Active SLA
          </span>
        );
      case "renewed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <RefreshCw className="w-3 h-3" /> Renewed
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            <Clock className="w-3 h-3" /> Expired
          </span>
        );
      case "terminated":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" /> Terminated
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 capitalize border border-amber-200 dark:border-amber-800">
            {status}
          </span>
        );
    }
  };

  const activeContracts = contracts.filter((c) => c.status === "active");
  const recurringCommitmentMinor = activeContracts.reduce((acc, c) => acc + c.amountMinor, 0);
  const annualizedCommitmentMinor = activeContracts.reduce((acc, c) => acc + getMonthlyNormalizedMinor(c) * 12, 0);
  const primaryCurrency = client?.currency || (contracts[0]?.currency ?? "INR");

  const filteredContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contracts.filter((c) => {
      if (q) {
        const matchCode = c.code.toLowerCase().includes(q);
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchNotes = (c.notes || "").toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchNotes) return false;
      }
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      return true;
    });
  }, [contracts, searchQuery, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Main Container */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Service Contracts &amp; SLAs
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                {client ? client.name : "Your Organization"} &bull; Legal agreements, retainer schedules, and SLA entitlements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {contracts.length > 0 && (
              <button
                onClick={() => setSummaryModalContract(activeContracts[0] || contracts[0])}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-semibold shadow-xs transition cursor-pointer"
                data-testid="open-contract-summary-btn"
              >
                <Printer className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-tech">Contract Summary</span>
              </button>
            )}
            <Link
              href="/portal/billing"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-semibold shadow-xs transition"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span className="font-tech font-bold">Go to Invoices</span>
            </Link>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="steel-metric-label">Active Contracts</span>
              <ShieldCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 tabular-nums"
              data-testid="portal-active-contracts-count"
            >
              {activeContracts.length}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Currently binding service agreements
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="steel-metric-label">Recurring Monthly Retainer</span>
              <CreditCard className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white tabular-nums"
              data-testid="portal-monthly-commitment"
            >
              {formatCurrency(recurringCommitmentMinor, primaryCurrency)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Fixed recurring service allocation
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="steel-metric-label">Annualized Retainer Value</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white tabular-nums">
              {formatCurrency(annualizedCommitmentMinor, primaryCurrency)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              12-month normalized SLA valuation
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="steel-metric-label">Total Agreements on File</span>
              <Layers className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white tabular-nums">
              {contracts.length}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Historical and active contracts
            </p>
          </div>
        </div>

        {/* SLA & Deliverable Terms Summary Card */}
        <div className="p-5 rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/60 via-white to-slate-50 dark:from-blue-950/25 dark:via-zinc-900 dark:to-zinc-900 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 font-tech">
                  Enterprise SLA &amp; Deliverable Terms Guarantee
                </h3>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Your active retainers include priority engineering response, continuous infrastructure telemetry, and guaranteed uptime under our Master Services Agreement.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
              <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
                <span className="text-[10px] text-zinc-400 uppercase block font-tech">Target Uptime</span>
                <span className="font-bold font-tech text-emerald-600 dark:text-emerald-400">99.95% SLA</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
                <span className="text-[10px] text-zinc-400 uppercase block font-tech">P1 Response</span>
                <span className="font-bold font-tech text-zinc-900 dark:text-white">&lt; 15 Mins</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
                <span className="text-[10px] text-zinc-400 uppercase block font-tech">Settlement Terms</span>
                <span className="font-bold font-tech text-zinc-900 dark:text-white">Net-15 Days</span>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
                <span className="text-[10px] text-zinc-400 uppercase block font-tech">Security &amp; IP</span>
                <span className="font-bold font-tech text-blue-600 dark:text-blue-400">100% Client IP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contracts by code, title, or terms..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="portal-contracts-search"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {["all", "active", "renewed", "expired", "terminated"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-tech font-semibold capitalize transition cursor-pointer ${
                  statusFilter === st
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
                data-testid={`portal-contract-filter-${st}`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Contracts List */}
        <div className="space-y-4">
          <h2 className="steel-heading text-sm text-zinc-900 dark:text-white">
            Active and Historical Retainer Contracts ({filteredContracts.length})
          </h2>

          {filteredContracts.length === 0 ? (
            <div className="py-24 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
              <FileText className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 font-sans">
                No matching contracts found
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                Once an engagement agreement or retainer is executed with RapidShift Labs, its terms and deliverables will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4" data-testid="portal-contracts-list">
              {filteredContracts.map((c) => {
                const tenure = getTenureStats(c);
                return (
                  <div
                    key={c.id}
                    className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                    data-testid={`portal-contract-card-${c.id}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                      <div className="space-y-1.5">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-tech text-xs font-bold text-blue-600 dark:text-blue-400">
                            {c.code}
                          </span>
                          <span>&bull;</span>
                          <h3 className="text-sm font-bold font-steel text-zinc-900 dark:text-white">
                            {c.title}
                          </h3>
                          {/* Billing Cycle & Tax Mode Badges */}
                          <span className="px-2 py-0.5 rounded text-[10px] font-tech font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {c.billingCycle.replace(/_/g, " ")} Cycle
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-tech font-semibold uppercase border ${
                              c.taxProfile === "gst"
                                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                            }`}
                          >
                            {c.taxProfile === "gst" ? "GST 18% Tax Mode" : "Non-GST Bill of Supply"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-sans">
                          Anchor Day: {c.anchorDay} of each cycle &bull; Tax Profile: {c.taxProfile.toUpperCase()}
                        </p>
                      </div>

                      <div className="flex items-center flex-wrap gap-2.5">
                        <button
                          onClick={() => setSummaryModalContract(c)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold border border-zinc-200 dark:border-zinc-700 transition font-tech cursor-pointer"
                          data-testid={`view-summary-${c.id}`}
                        >
                          <Printer className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Summary</span>
                        </button>
                        <a
                          href={`/api/v1/portal/contracts/${c.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-semibold border border-blue-200 dark:border-blue-800 transition shadow-xs font-tech"
                          data-testid={`download-agreement-pdf-${c.id}`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Agreement PDF</span>
                        </a>
                        {getStatusBadge(c.status)}
                        <div className="text-right">
                          <span className="text-base font-bold font-tech text-zinc-900 dark:text-white tabular-nums">
                            {formatCurrency(c.amountMinor, c.currency)}
                          </span>
                          <span className="text-[11px] text-zinc-500 block font-sans">
                            / {c.billingCycle}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contract Tenure Progress Bar */}
                    <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-500" />
                          Contract Tenure Progress ({tenure.elapsedDays}d elapsed / {tenure.remainingDays}d remaining)
                        </span>
                        <span className="font-tech font-bold text-blue-600 dark:text-blue-400">
                          {tenure.pct}% Completed
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
                          style={{ width: `${tenure.pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Terms & Validity */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-zinc-500 text-[11px] block">Agreement Period</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {formatDate(c.validFrom)} to {formatDate(c.validTo)}
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-500 text-[11px] block">Renewal Policy</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {c.autoRenew ? "Automatic Annual Renewal" : "Manual Renewal Upon Expiry"}
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-500 text-[11px] block">Billing Schedule</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 capitalize">
                          Every {c.intervalCount > 1 ? `${c.intervalCount} ` : ""}
                          {c.billingCycle} (Due within 15 days)
                        </span>
                      </div>
                    </div>

                    {/* Line Items / Deliverables */}
                    {c.items && c.items.length > 0 && (
                      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
                          Deliverables &amp; Scope Breakdown
                        </span>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500">
                              <tr>
                                <th className="px-3 py-2">Deliverable Item</th>
                                <th className="px-3 py-2 text-center">Qty</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                              {c.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                                    {item.description}
                                  </td>
                                  <td className="px-3 py-2 text-center text-zinc-600 dark:text-zinc-400">
                                    {item.quantity}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-white">
                                    {formatCurrency(item.amountMinor, c.currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Notes / Special terms */}
                    {c.notes && (
                      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-0.5">
                          Terms &amp; Conditions:
                        </span>
                        {c.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Printable / Downloadable Contract Summary Modal */}
      {summaryModalContract && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-[11px] font-tech uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">
                  RapidShift Labs • Commercial Retainer Summary
                </span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
                  {summaryModalContract.title} ({summaryModalContract.code})
                </h3>
                <p className="text-xs text-zinc-500">
                  Prepared for {client?.name || "Client Organization"}
                </p>
              </div>
              <button
                onClick={() => setSummaryModalContract(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block">Cycle Value</span>
                <span className="font-bold font-tech text-sm text-zinc-900 dark:text-white">
                  {formatCurrency(summaryModalContract.amountMinor, summaryModalContract.currency)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block">Billing Frequency</span>
                <span className="font-bold font-tech text-sm capitalize text-zinc-900 dark:text-white">
                  {summaryModalContract.billingCycle.replace(/_/g, " ")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block">Tax Regime</span>
                <span className="font-bold font-tech text-sm uppercase text-blue-600 dark:text-blue-400">
                  {summaryModalContract.taxProfile === "gst" ? "GST (18%)" : "Non-GST"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block">Anchor Day</span>
                <span className="font-bold font-tech text-sm text-zinc-900 dark:text-white">
                  Day {summaryModalContract.anchorDay}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-zinc-500">
                Included SLA &amp; Governance Entitlements
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {[
                  "99.95% Infrastructure Uptime Guarantee",
                  "Dedicated Cloud Architecture & DevOps Support",
                  "Automated Security Patching & Fleet Telemetry",
                  "100% Client Ownership of Deliverable IP",
                ].map((term) => (
                  <li key={term} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{term}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Summary</span>
              </button>
              <a
                href={`/api/v1/portal/contracts/${summaryModalContract.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition font-tech"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official MSA PDF</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
