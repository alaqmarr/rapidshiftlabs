"use client";

import Link from "next/link";
import {
  FileText,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  CreditCard,
  Layers,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
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
                {client ? client.name : "Your Organization"} &bull; Legal agreements, terms, and commitments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              {formatCurrency(recurringCommitmentMinor, client?.currency || (contracts[0]?.currency ?? "INR"))}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Fixed recurring service allocation
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

        {/* Contracts List */}
        <div className="space-y-4">
          <h2 className="steel-heading text-sm text-zinc-900 dark:text-white">
            Active and Historical Retainer Contracts
          </h2>

          {contracts.length === 0 ? (
            <div className="py-24 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
              <FileText className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 font-sans">
                No contracts signed yet
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                Once an engagement agreement or retainer is executed with RapidShift Labs, its terms and deliverables will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4" data-testid="portal-contracts-list">
              {contracts.map((c) => (
                <div
                  key={c.id}
                  className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  data-testid={`portal-contract-card-${c.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-tech text-xs font-bold text-blue-600 dark:text-blue-400">
                          {c.code}
                        </span>
                        <span>&bull;</span>
                        <h3 className="text-sm font-bold font-steel text-zinc-900 dark:text-white">
                          {c.title}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-500 font-sans">
                        Anchor Day: {c.anchorDay} of each cycle &bull; Tax Profile: {c.taxProfile.toUpperCase()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
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
                        Deliverables & Scope Breakdown
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
                        Terms & Conditions:
                      </span>
                      {c.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
