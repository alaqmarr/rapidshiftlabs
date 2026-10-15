"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Play,
  Calendar,
  X,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import {
  formatCurrency as kernelFormatCurrency,
  SUPPORTED_CURRENCY_LIST,
} from "@/lib/currency";

export interface ContractItem {
  id: string;
  code: string;
  title: string;
  clientId: string;
  clientName: string;
  status: "draft" | "active" | "renewed" | "expired" | "terminated";
  amountMinor: number;
  currency: string;
  billingCycle: string;
  intervalCount: number;
  anchorDay: number;
  validFrom: number;
  validTo: number;
  taxProfile: string;
  createdAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface ContractManagerProps {
  initialContracts: ContractItem[];
  clients: ClientOption[];
}

export function ContractManager({ initialContracts, clients }: ContractManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState(() => ({
    clientId: clients[0]?.id || "",
    title: "",
    amountMajor: "25000",
    currency: "INR",
    billingCycle: "monthly",
    intervalCount: "1",
    anchorDay: "1",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    taxProfile: "non_gst",
  }));

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const refreshContracts = async () => {
    try {
      const res = await fetch("/api/v1/admin/contracts");
      const data = (await res.json()) as { items?: ContractItem[] };
      if (data.items) {
        setContracts(data.items);
      }
    } catch (err) {
      console.error("Failed to refresh contracts:", err);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      showError("Client Selection Required", "Please select a client before creating a contract.");
      return;
    }
    try {
      setSubmitting(true);
      const amountMinor = Math.round(Number(formData.amountMajor) * 100);
      const selectedClient = clients.find((c) => c.id === formData.clientId);
      const res = await fetch("/api/v1/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          amountMinor,
          intervalCount: Number(formData.intervalCount),
          anchorDay: Number(formData.anchorDay),
        }),
      });
      const data = (await res.json()) as { contract: { id: string; title: string; code?: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create contract");

      showSuccess(
        "Contract Created Successfully",
        `Contract '${data.contract.title}' has been drafted. Activate it to initiate the automated recurring billing schedule.`,
        [
          { label: "Contract Title", value: data.contract.title },
          { label: "Client", value: selectedClient?.name || "Client" },
          { label: "Recurring Value", value: kernelFormatCurrency(Math.round(Number(formData.amountMajor) * 100), (data.contract as any)?.currency || "INR") },
          { label: "Billing Cycle", value: `${formData.billingCycle.toUpperCase()} (Day ${formData.anchorDay})` },
          { label: "Validity", value: `${formData.validFrom} to ${formData.validTo}` },
        ]
      );
      setShowCreateModal(false);
      await refreshContracts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create contract";
      showError("Contract Creation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivateContract = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/v1/admin/contracts/${id}/activate`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to activate contract");

      showSuccess(
        "Contract Activated",
        `Contract '${title}' is now ACTIVE. Automated billing generator and dunning schedules are actively tracking this contract.`,
        [
          { label: "Contract ID", value: id },
          { label: "Status", value: "ACTIVE" },
        ]
      );
      await refreshContracts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to activate contract";
      showError("Activation Failed", msg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {toast.message}
        </div>
      )}

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 flex-1 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Contracts &amp; Retainers
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Tenure dates, recurring cycles, tax profiles, and automated billing generation
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (clients.length > 0 && !formData.clientId) {
                setFormData((prev) => ({ ...prev, clientId: clients[0].id }));
              }
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
            data-testid="new-contract-btn"
          >
            <Plus className="w-4 h-4" />
            <span className="font-tech font-bold">New Contract</span>
          </button>
        </div>

        {/* KPI Metrics Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Total Contracts</span>
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2 tabular-nums">
              {contracts.length}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Across {new Set(contracts.map((c) => c.clientId)).size} client tenant(s)
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Active Retainers</span>
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-2 tabular-nums">
              {contracts.filter((c) => c.status === "active").length}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Active SLA billing cycles
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Committed Value</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2 tabular-nums">
              {formatCurrency(contracts.filter((c) => c.status === "active").reduce((acc, c) => acc + c.amountMinor, 0), "INR")}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Active contracted billing sum
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Draft Agreements</span>
              <Play className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-2 tabular-nums">
              {contracts.filter((c) => c.status === "draft").length}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Awaiting activation
            </div>
          </div>
        </div>

        {/* Contracts Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm" data-testid="contracts-table">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/75 dark:bg-zinc-800/50 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="steel-metric-label py-3.5 px-6">Contract Code / Title</th>
                  <th className="steel-metric-label py-3.5 px-6">Client</th>
                  <th className="steel-metric-label py-3.5 px-6">Tenure Period</th>
                  <th className="steel-metric-label py-3.5 px-6">Cycle / Amount</th>
                  <th className="steel-metric-label py-3.5 px-6">Status</th>
                  <th className="steel-metric-label py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400 font-sans">
                      No contracts registered yet. Click &quot;New Contract&quot; to author an agreement.
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition"
                      data-testid={`contract-row-${contract.id}`}
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold font-steel text-zinc-900 dark:text-zinc-100">{contract.title}</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-tech font-bold mt-0.5">{contract.code}</div>
                      </td>
                      <td className="py-4 px-6 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center text-[10px] font-bold font-tech">
                            {contract.clientName.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-sans">{contract.clientName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-xs text-zinc-600 dark:text-zinc-400 font-tech">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                          <span>
                            {formatDate(contract.validFrom)} → {formatDate(contract.validTo)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-bold font-tech text-zinc-900 dark:text-zinc-100 tabular-nums">
                          {formatCurrency(contract.amountMinor, contract.currency || "INR")}
                        </div>
                        <div className="text-xs text-zinc-500 capitalize font-sans">
                          {contract.billingCycle.replace(/_/g, " ")} (Anchor: Day {contract.anchorDay})
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            contract.status === "active"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : contract.status === "draft"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              contract.status === "active"
                                ? "bg-emerald-500 animate-pulse"
                                : contract.status === "draft"
                                ? "bg-amber-500"
                                : "bg-zinc-400"
                            }`}
                          />
                          {contract.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/api/v1/billing/contracts/${contract.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 transition font-tech"
                            title="Download Master Services Agreement PDF"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            <span>Agreement PDF</span>
                          </a>
                          {contract.status === "draft" ? (
                            <button
                              onClick={() => handleActivateContract(contract.id, contract.title)}
                              className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition cursor-pointer"
                              data-testid={`activate-contract-${contract.id}`}
                            >
                              <Play className="w-3.5 h-3.5" />
                              Activate
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              ✓ Active
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* New Contract Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <h3 className="font-semibold text-lg">Create New Contract</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Select Client *
                </label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="contract-client-select"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Contract Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Services Agreement & Cloud Retainer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="contract-title-input"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Currency *
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {SUPPORTED_CURRENCY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Amount ({formData.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="25000"
                    value={formData.amountMajor}
                    onChange={(e) => setFormData({ ...formData, amountMajor: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    data-testid="contract-amount-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={formData.billingCycle}
                    onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="contract-cycle-select"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one_time">One-Time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Valid From *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Valid To *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.validTo}
                    onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Anchor Day (1-31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.anchorDay}
                    onChange={(e) => setFormData({ ...formData, anchorDay: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Tax Profile
                  </label>
                  <select
                    value={formData.taxProfile}
                    onChange={(e) => setFormData({ ...formData, taxProfile: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="non_gst">Non-GST</option>
                    <option value="gst">GST (18%)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
                  data-testid="submit-create-contract"
                >
                  {submitting ? "Creating..." : "Create Agreement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
