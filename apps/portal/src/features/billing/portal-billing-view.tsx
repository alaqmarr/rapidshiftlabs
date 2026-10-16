"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CreditCard,
  Receipt,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  Search,
  Eye,
  X,
  Copy,
  Check,
} from "lucide-react";
import { formatCurrency as kernelFormatCurrency } from "@/lib/currency";

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  billingMode: "gst" | "non_gst";
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
  issueDate: number;
  dueDate: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  currency: string;
  createdAt: number;
}

export interface PaymentItem {
  id: string;
  invoiceId: string;
  amountMinor: number;
  method: string;
  paymentDate: number;
  reference?: string;
  notes?: string;
}

export interface BillingSummary {
  totalBilledMinor: number;
  totalPaidMinor: number;
  outstandingMinor: number;
  overdueCount: number;
  activeInvoicesCount: number;
}

export interface ClientData {
  id: string;
  name: string;
  billingEmail?: string;
  currency?: string;
}

interface PortalBillingViewProps {
  client: ClientData | null;
  invoices: InvoiceItem[];
  payments: PaymentItem[];
  summary: BillingSummary;
  nextDueInvoice: InvoiceItem | null;
}

export function PortalBillingView({
  client,
  invoices,
  payments,
  summary,
  nextDueInvoice,
}: PortalBillingViewProps) {
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState<InvoiceItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const formatCurrency = (minor: number, curr?: string) => {
    return kernelFormatCurrency(minor, curr || client?.currency || "INR");
  };

  const formatDate = (ms: number | string | undefined) => {
    if (!ms) return "—";
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleCopy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getTaxBreakdown = (inv: InvoiceItem) => {
    if (inv.billingMode === "gst") {
      const subtotalMinor = Math.round(inv.totalMinor / 1.18);
      const gstMinor = Math.max(0, inv.totalMinor - subtotalMinor);
      return { subtotalMinor, gstMinor, isGst: true };
    }
    return { subtotalMinor: inv.totalMinor, gstMinor: 0, isGst: false };
  };

  // Compute Live Access Gate & Entitlement Status from overdue invoices
  const entitlementGate = useMemo(() => {
    const overdueInvoices = invoices.filter(
      (i) => i.status === "overdue" || (i.balanceMinor > 0 && i.dueDate < now && i.status !== "draft" && i.status !== "void")
    );

    if (overdueInvoices.length === 0) {
      return {
        tier: "Active" as const,
        badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        bannerColor: "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20",
        headline: "All Services Operational • Entitlement Pass Active",
        subtext: "Your Ed25519 access pass and production fleet endpoints are operating with zero restrictions.",
        countdownText: "0 Days Overdue • Full SLA Access",
      };
    }

    const earliestDue = Math.min(...overdueInvoices.map((i) => i.dueDate));
    const daysOverdue = Math.max(1, Math.floor((now - earliestDue) / 86400000));

    if (daysOverdue <= 3) {
      const graceRemaining = Math.max(0, 3 - daysOverdue);
      return {
        tier: "Grace Period" as const,
        badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        bannerColor: "border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20",
        headline: `Payment Overdue (${daysOverdue}d) • Grace Period Active`,
        subtext: "Your services remain online during the 72-hour grace window. Please settle outstanding invoices to prevent route restrictions.",
        countdownText: `${graceRemaining} day(s) remaining before Restricted Mode`,
      };
    }

    if (daysOverdue <= 7) {
      const blockRemaining = Math.max(0, 7 - daysOverdue);
      return {
        tier: "Restricted" as const,
        badgeColor: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
        bannerColor: "border-orange-200 dark:border-orange-900/60 bg-orange-50/50 dark:bg-orange-950/20",
        headline: `Account in Restricted Mode (${daysOverdue}d Overdue)`,
        subtext: "Administrative and non-essential routes (/admin, /api/admin) are currently throttled. Remit balance to restore full access.",
        countdownText: `${blockRemaining} day(s) until full Access Gate Lockout`,
      };
    }

    return {
      tier: "Blocked" as const,
      badgeColor: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
      bannerColor: "border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20",
      headline: `Access Gate Blocked (${daysOverdue}d Overdue)`,
      subtext: "API Access Gate pass issuance is suspended due tooverdue balance exceeding 7 days. Settle immediately to re-enable services.",
      countdownText: `Suspended (${daysOverdue} days past due)`,
    };
  }, [invoices, now]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (q && !inv.invoiceNumber.toLowerCase().includes(q) && !inv.status.toLowerCase().includes(q)) {
        return false;
      }
      if (invoiceStatusFilter === "unpaid") {
        return inv.balanceMinor > 0 && inv.status !== "void";
      }
      if (invoiceStatusFilter === "paid") {
        return inv.status === "paid" || inv.balanceMinor === 0;
      }
      return true;
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case "partially_paid":
        return (
          <span className="steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Partial
          </span>
        );
      case "overdue":
        return (
          <span className="steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <ShieldAlert className="w-3 h-3" /> Overdue
          </span>
        );
      case "issued":
        return (
          <span className="steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Awaiting Payment
          </span>
        );
      default:
        return (
          <span className="steel-pill inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 capitalize">
            {status}
          </span>
        );
    }
  };

  const getDueCountdown = (dueDateMs: number) => {
    const diffDays = Math.ceil((dueDateMs - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { text: `Overdue by ${Math.abs(diffDays)} days`, isOverdue: true };
    }
    if (diffDays === 0) {
      return { text: "Due today", isOverdue: false };
    }
    return { text: `Due in ${diffDays} days`, isOverdue: false };
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Main Container */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Billing &amp; Invoices
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                {client ? client.name : "Your Organization"} &bull; Financial statements, payments &amp; GST tax receipts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/portal/contracts"
              className="steel-pill inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shadow-xs"
            >
              <span>View Service Contracts</span>
            </Link>
          </div>
        </div>

        {/* Live Access Gate & Entitlement Status Banner */}
        <div
          className={`p-4 sm:p-5 rounded-xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${entitlementGate.bannerColor}`}
          data-testid="portal-entitlement-banner"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-tech border ${entitlementGate.badgeColor}`}
                data-testid="portal-entitlement-tier"
              >
                {entitlementGate.tier === "Active" ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                Access Gate: {entitlementGate.tier}
              </span>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                {entitlementGate.headline}
              </h2>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {entitlementGate.subtext}
            </p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <span className="text-[10px] font-tech uppercase tracking-wider text-zinc-500 block">
              Gate Enforcement Countdown
            </span>
            <span className="text-xs font-bold font-tech text-zinc-900 dark:text-white">
              {entitlementGate.countdownText}
            </span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Outstanding Balance */}
          <div
            className={`p-5 rounded-xl border shadow-xs ${
              summary.outstandingMinor > 0
                ? "bg-amber-500/5 border-amber-200 dark:border-amber-900/60"
                : "bg-blue-500/5 border-blue-200 dark:border-blue-900/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Outstanding Balance</span>
              {summary.outstandingMinor > 0 ? (
                <AlertTriangle className="w-4 h-4 text-blue-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              )}
            </div>
            <div
              className={`mt-2 text-2xl font-tech tabular-nums steel-kpi ${
                summary.outstandingMinor > 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-zinc-900 dark:text-white"
              }`}
              data-testid="portal-outstanding-balance"
            >
              {formatCurrency(summary.outstandingMinor)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              {summary.outstandingMinor > 0
                ? `${summary.activeInvoicesCount} unpaid invoice(s)`
                : "All accounts fully settled"}
            </p>
          </div>

          {/* Next Due Countdown */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Next Due Date</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 text-xl font-tech tabular-nums steel-kpi text-zinc-900 dark:text-white" data-testid="portal-next-due-date">
              {nextDueInvoice ? formatDate(nextDueInvoice.dueDate) : "No Dues"}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              {nextDueInvoice ? (
                <span
                  className={
                    getDueCountdown(nextDueInvoice.dueDate).isOverdue
                      ? "text-blue-600 dark:text-blue-400 font-semibold"
                      : "text-zinc-500 font-medium"
                  }
                >
                  {getDueCountdown(nextDueInvoice.dueDate).text} (
                  <span className="font-tech">{nextDueInvoice.invoiceNumber}</span>)
                </span>
              ) : (
                "No open scheduled invoices"
              )}
            </p>
          </div>

          {/* Total Paid */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Total Paid to Date</span>
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-tech tabular-nums steel-kpi text-zinc-900 dark:text-white"
              data-testid="portal-total-paid"
            >
              {formatCurrency(summary.totalPaidMinor)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              {payments.length} verified remittances
            </p>
          </div>

          {/* Cumulative Billed */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Cumulative Billed</span>
              <Receipt className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-tech tabular-nums steel-kpi text-zinc-900 dark:text-white"
              data-testid="portal-total-billed"
            >
              {formatCurrency(summary.totalBilledMinor)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Lifetime statement total
            </p>
          </div>
        </div>

        {/* Remittance & Bank Settlement Box */}
        <div className="p-5 rounded-xl border border-blue-100 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/50 via-white to-slate-50 dark:from-blue-950/20 dark:via-zinc-900 dark:to-zinc-900 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="steel-heading text-xs uppercase tracking-wider text-blue-900 dark:text-blue-300">
                  Direct Remittance Account Details
                </h3>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Please remit payments referencing your Invoice Number via NEFT/RTGS, SWIFT, or UPI:
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-tech tabular-nums">
              <div>
                <span className="steel-metric-label text-zinc-400 block">Bank:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">HDFC Bank</span>
              </div>
              <div>
                <span className="steel-metric-label text-zinc-400 block">Account No:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">50200088912345</span>
              </div>
              <div>
                <span className="steel-metric-label text-zinc-400 block">IFSC Code:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">HDFC0001234</span>
              </div>
              <div>
                <span className="steel-metric-label text-zinc-400 block">UPI ID:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">rapidshift@hdfcbank</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Search/Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer font-tech ${
                activeTab === "invoices"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              data-testid="portal-tab-invoices"
            >
              <Receipt className="w-4 h-4" />
              <span>Tax Invoices ({invoices.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("payments")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer font-tech ${
                activeTab === "payments"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              data-testid="portal-tab-payments"
            >
              <CreditCard className="w-4 h-4" />
              <span>Payment History ({payments.length})</span>
            </button>
          </div>

          {activeTab === "invoices" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice #..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="portal-invoice-search"
                />
              </div>

              <div className="flex items-center gap-1">
                {[
                  { key: "all", label: "All" },
                  { key: "unpaid", label: "Unpaid / Due" },
                  { key: "paid", label: "Paid" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setInvoiceStatusFilter(f.key as typeof invoiceStatusFilter)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                      invoiceStatusFilter === f.key
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                    data-testid={`portal-invoice-filter-${f.key}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content Table */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          {activeTab === "invoices" ? (
            filteredInvoices.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <Receipt className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="steel-heading text-sm text-zinc-900 dark:text-zinc-100">
                  No invoices match your filter
                </p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                  Invoices will appear here once your recurring billing period generates or an engineer creates an ad-hoc invoice.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="portal-invoices-table">
                  <thead className="bg-zinc-50/75 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="steel-metric-label px-4 py-3">Invoice Number</th>
                      <th className="steel-metric-label px-4 py-3">Issue Date</th>
                      <th className="steel-metric-label px-4 py-3">Due Date</th>
                      <th className="steel-metric-label px-4 py-3">Status</th>
                      <th className="steel-metric-label px-4 py-3 text-right">Tax Breakdown (Sub + GST)</th>
                      <th className="steel-metric-label px-4 py-3 text-right">Total Amount</th>
                      <th className="steel-metric-label px-4 py-3 text-right">Balance Due</th>
                      <th className="steel-metric-label px-4 py-3 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredInvoices.map((inv) => {
                      const tax = getTaxBreakdown(inv);
                      return (
                        <tr
                          key={inv.id}
                          onClick={() => setSelectedInvoiceModal(inv)}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                          data-testid={`portal-invoice-row-${inv.id}`}
                        >
                          <td className="px-4 py-3.5 font-tech tabular-nums font-semibold text-zinc-900 dark:text-white">
                            <div>{inv.invoiceNumber}</div>
                            <span className="text-[10px] font-normal text-zinc-400 uppercase">
                              {inv.billingMode === "gst" ? "GST 18%" : "Non-GST"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300 font-tech tabular-nums">
                            {formatDate(inv.issueDate)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300 font-tech tabular-nums">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="px-4 py-3.5">{getStatusBadge(inv.status)}</td>
                          <td className="px-4 py-3.5 text-right font-tech tabular-nums text-zinc-500">
                            {tax.isGst ? (
                              <span>
                                {formatCurrency(tax.subtotalMinor, inv.currency)} +{" "}
                                <span className="text-blue-600 dark:text-blue-400">
                                  {formatCurrency(tax.gstMinor, inv.currency)} GST
                                </span>
                              </span>
                            ) : (
                              <span>{formatCurrency(tax.subtotalMinor, inv.currency)} (0% Tax)</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-tech tabular-nums font-semibold text-zinc-900 dark:text-white">
                            {formatCurrency(inv.totalMinor, inv.currency)}
                          </td>
                          <td
                            className={`px-4 py-3.5 text-right font-tech tabular-nums font-semibold ${
                              inv.balanceMinor > 0
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-zinc-400"
                            }`}
                          >
                            {formatCurrency(inv.balanceMinor, inv.currency)}
                          </td>
                          <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedInvoiceModal(inv)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition cursor-pointer"
                                data-testid={`inspect-portal-invoice-${inv.id}`}
                              >
                                <Eye className="w-3 h-3" />
                                <span>Details</span>
                              </button>
                              <a
                                href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition"
                                data-testid={`download-pdf-${inv.id}`}
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : payments.length === 0 ? (
            <div className="py-24 text-center space-y-3">
              <CreditCard className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="steel-heading text-sm text-zinc-900 dark:text-zinc-100">
                No payments recorded yet
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                Once incoming wire transfers or UPI settlements are recorded, they will appear here with full transaction receipts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="portal-payments-table">
                <thead className="bg-zinc-50/75 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="steel-metric-label px-4 py-3">Receipt / ID</th>
                    <th className="steel-metric-label px-4 py-3">Date</th>
                    <th className="steel-metric-label px-4 py-3">Method</th>
                    <th className="steel-metric-label px-4 py-3">Transaction / UTR Reference</th>
                    <th className="steel-metric-label px-4 py-3 text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`portal-payment-row-${p.id}`}
                    >
                      <td className="px-4 py-3.5 font-tech text-[11px] text-zinc-500">
                        {p.id.slice(0, 16)}...
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-300 font-tech tabular-nums">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="steel-pill inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          {p.method}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-tech text-[11px] text-zinc-600 dark:text-zinc-300">
                        {p.reference || <span className="text-zinc-400 italic">None</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-tech tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.amountMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Interactive Invoice Breakdown Modal */}
      {selectedInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-[10px] font-tech uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">
                  Statement &amp; Tax Breakdown
                </span>
                <h3 className="text-lg font-bold font-tech text-zinc-900 dark:text-white mt-0.5">
                  {selectedInvoiceModal.invoiceNumber}
                </h3>
                <p className="text-xs text-zinc-500">
                  Issued: {formatDate(selectedInvoiceModal.issueDate)} &bull; Due: {formatDate(selectedInvoiceModal.dueDate)}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoiceModal(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {(() => {
              const tax = getTaxBreakdown(selectedInvoiceModal);
              return (
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs font-tech">
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Taxable Subtotal:</span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {formatCurrency(tax.subtotalMinor, selectedInvoiceModal.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>{tax.isGst ? "GST Tax (18%):" : "Tax (Bill of Supply 0%):"}</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      + {formatCurrency(tax.gstMinor, selectedInvoiceModal.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2 font-bold text-zinc-900 dark:text-white">
                    <span>Total Invoice Amount:</span>
                    <span>{formatCurrency(selectedInvoiceModal.totalMinor, selectedInvoiceModal.currency)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Amount Paid:</span>
                    <span>- {formatCurrency(selectedInvoiceModal.paidMinor, selectedInvoiceModal.currency)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2 text-sm font-bold text-amber-600">
                    <span>Remaining Balance Due:</span>
                    <span>{formatCurrency(selectedInvoiceModal.balanceMinor, selectedInvoiceModal.currency)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Bank & UPI Settlement Instructions */}
            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 font-tech uppercase tracking-wider">
                <Landmark className="w-4 h-4" />
                <span>Instant Settlement Instructions</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Include <strong className="font-mono">{selectedInvoiceModal.invoiceNumber}</strong> in your transfer remarks for automated reconciliation:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-tech">
                <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">HDFC A/C Number</span>
                    <span className="font-bold">50200088912345</span>
                  </div>
                  <button
                    onClick={() => handleCopy("acct", "50200088912345")}
                    className="p-1 text-zinc-400 hover:text-blue-600 cursor-pointer"
                  >
                    {copiedField === "acct" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Corporate UPI VPA</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">rapidshift@hdfcbank</span>
                  </div>
                  <button
                    onClick={() => handleCopy("upi", "rapidshift@hdfcbank")}
                    className="p-1 text-zinc-400 hover:text-blue-600 cursor-pointer"
                  >
                    {copiedField === "upi" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setSelectedInvoiceModal(null)}
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Close
              </button>
              <a
                href={`/api/v1/billing/invoices/${selectedInvoiceModal.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition font-tech"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official PDF</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
