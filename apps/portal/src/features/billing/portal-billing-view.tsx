"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  ArrowLeft,
  Receipt,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Landmark,
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

        {/* Tabs for Invoices vs Payments */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
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

        {/* Content Table */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          {activeTab === "invoices" ? (
            invoices.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <Receipt className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="steel-heading text-sm text-zinc-900 dark:text-zinc-100">
                  No invoices issued yet
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
                      <th className="steel-metric-label px-4 py-3 text-right">Total Amount</th>
                      <th className="steel-metric-label px-4 py-3 text-right">Balance Due</th>
                      <th className="steel-metric-label px-4 py-3 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                        data-testid={`portal-invoice-row-${inv.id}`}
                      >
                        <td className="px-4 py-3.5 font-tech tabular-nums font-semibold text-zinc-900 dark:text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300 font-tech tabular-nums">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300 font-tech tabular-nums">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="px-4 py-3.5">{getStatusBadge(inv.status)}</td>
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
                        <td className="px-4 py-3.5 text-center">
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
                        </td>
                      </tr>
                    ))}
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
    </div>
  );
}
