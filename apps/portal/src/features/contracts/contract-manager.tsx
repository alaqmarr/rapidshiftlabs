"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  Plus,
  CheckCircle2,
  AlertCircle,
  Play,
  Calendar,
  X,
  Search,
  Filter,
  Download,
  TrendingUp,
  Clock,
  ShieldCheck,
  Receipt,
  ArrowUpDown,
  Eye,
  Sparkles,
  Building2,
  Percent,
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
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "amount_desc" | "expiry_asc" | "client_asc">("newest");

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

  // Normalization helpers for MRR & ARR
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
        return 0;
    }
  };

  const getAnnualizedMinor = (c: ContractItem): number => {
    if (c.billingCycle.toLowerCase() === "one_time") return c.amountMinor;
    return getMonthlyNormalizedMinor(c) * 12;
  };

  const getTenureMetrics = (c: ContractItem) => {
    const start = c.validFrom || c.createdAt || now;
    const end = c.validTo || start + 365 * 86400000;
    const totalMs = Math.max(1, end - start);
    const elapsedMs = Math.max(0, Math.min(totalMs, now - start));
    const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
    const daysRemaining = Math.ceil((end - now) / 86400000);
    const isExpiringSoon = c.status === "active" && daysRemaining >= 0 && daysRemaining <= 60;
    const isOverdueRenewal = c.status === "active" && daysRemaining < 0;
    return {
      progressPct,
      daysRemaining,
      isExpiringSoon,
      isOverdueRenewal,
    };
  };

  const getProjectedSchedule = (c: ContractItem) => {
    const schedule: Array<{ cycleIndex: number; dateStr: string; amountMinor: number; taxMinor: number; totalMinor: number }> = [];
    const baseDate = new Date(Math.max(now, c.validFrom || now));
    const anchor = Math.min(28, Math.max(1, c.anchorDay || 1));
    const isGst = c.taxProfile === "gst";
    const count = c.billingCycle === "one_time" ? 1 : 6;

    for (let i = 0; i < count; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), anchor);
      const stepMonths =
        c.billingCycle === "quarterly"
          ? 3
          : c.billingCycle === "half_yearly"
          ? 6
          : c.billingCycle === "yearly"
          ? 12
          : 1;
      d.setMonth(d.getMonth() + i * stepMonths * Math.max(1, c.intervalCount || 1));
      const taxMinor = isGst ? Math.round(c.amountMinor * 0.18) : 0;
      schedule.push({
        cycleIndex: i + 1,
        dateStr: formatDate(d.getTime()),
        amountMinor: c.amountMinor,
        taxMinor,
        totalMinor: c.amountMinor + taxMinor,
      });
    }
    return schedule;
  };

  // Telemetry Calculations
  const telemetry = useMemo(() => {
    const activeList = contracts.filter((c) => c.status === "active" || c.status === "renewed");
    const mrrMinor = activeList.reduce((acc, c) => acc + getMonthlyNormalizedMinor(c), 0);
    const arrMinor = mrrMinor * 12;
    const expiring60Count = activeList.filter((c) => {
      const { daysRemaining } = getTenureMetrics(c);
      return daysRemaining >= 0 && daysRemaining <= 60;
    }).length;
    const gstContracts = contracts.filter((c) => c.taxProfile === "gst");
    const nonGstContracts = contracts.filter((c) => c.taxProfile !== "gst");
    const gstPct = contracts.length > 0 ? Math.round((gstContracts.length / contracts.length) * 100) : 0;

    return {
      activeCount: activeList.length,
      mrrMinor,
      arrMinor,
      expiring60Count,
      gstCount: gstContracts.length,
      nonGstCount: nonGstContracts.length,
      gstPct,
    };
  }, [contracts, now]);

  // Filtered & Sorted Contracts
  const filteredContracts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = contracts.filter((c) => {
      if (q) {
        const matchCode = c.code.toLowerCase().includes(q);
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchClient = c.clientName.toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchClient) return false;
      }
      if (clientFilter !== "all" && c.clientId !== clientFilter) return false;
      if (cycleFilter !== "all" && c.billingCycle.toLowerCase() !== cycleFilter.toLowerCase()) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "expiring_soon") {
          const { isExpiringSoon, isOverdueRenewal } = getTenureMetrics(c);
          if (!isExpiringSoon && !isOverdueRenewal) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "amount_desc") return b.amountMinor - a.amountMinor;
      if (sortBy === "expiry_asc") return (a.validTo || 0) - (b.validTo || 0);
      if (sortBy === "client_asc") return a.clientName.localeCompare(b.clientName);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [contracts, searchQuery, clientFilter, cycleFilter, statusFilter, sortBy, now]);

  const refreshContracts = async () => {
    try {
      const res = await fetch("/api/v1/admin/contracts");
      const data = (await res.json()) as { items?: ContractItem[] };
      if (data.items) {
        setContracts(data.items);
        if (selectedContract) {
          const updated = data.items.find((i) => i.id === selectedContract.id);
          if (updated) setSelectedContract(updated);
        }
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
      const data = (await res.json()) as { contract: { id: string; title: string; code?: string; currency?: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create contract");

      showSuccess(
        "Contract Created Successfully",
        `Contract '${data.contract.title}' has been drafted. Activate it to initiate the automated recurring billing schedule.`,
        [
          { label: "Contract Title", value: data.contract.title },
          { label: "Client", value: selectedClient?.name || "Client" },
          { label: "Recurring Value", value: kernelFormatCurrency(Math.round(Number(formData.amountMajor) * 100), data.contract?.currency || "INR") },
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

  const handleGenerateCycleInvoice = async (contract: ContractItem) => {
    try {
      setGeneratingInvoiceId(contract.id);
      const dueDateIso = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      const billingMode = contract.taxProfile === "gst" ? "gst" : "non_gst";

      // Try dedicated contract invoice endpoint first; fallback to standard admin invoice endpoint
      let res = await fetch(`/api/v1/contracts/${contract.id}/generate-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        res = await fetch("/api/v1/admin/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: contract.clientId,
            contractId: contract.id,
            billingMode,
            currency: contract.currency || "INR",
            dueDate: dueDateIso,
            issueImmediately: true,
            notes: `Automated cycle billing for Contract ${contract.code} (${contract.title})`,
            lines: [
              {
                description: `${contract.title} — ${contract.billingCycle.replace(/_/g, " ").toUpperCase()} Retainer Cycle`,
                unitPriceMinor: contract.amountMinor,
                quantity: 1,
              },
            ],
          }),
        });
      }

      const data = (await res.json()) as { invoice?: { invoiceNumber?: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to generate invoice for current cycle");

      const invNum = data.invoice?.invoiceNumber || `INV-${Date.now().toString().slice(-5)}`;
      showSuccess(
        "Cycle Invoice Generated & Issued",
        `Invoice ${invNum} was generated from Contract ${contract.code} and issued to ${contract.clientName}.`,
        [
          { label: "Invoice Number", value: invNum, copyable: true },
          { label: "Contract Code", value: contract.code },
          { label: "Client", value: contract.clientName },
          { label: "Cycle Amount", value: formatCurrency(contract.amountMinor, contract.currency) },
          { label: "Tax Mode", value: billingMode.toUpperCase() },
        ]
      );
      showToast(`Generated Invoice ${invNum} for ${contract.clientName}`, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate cycle invoice";
      showError("Invoice Generation Failed", msg);
    } finally {
      setGeneratingInvoiceId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Contract Code",
      "Title",
      "Client Name",
      "Status",
      "Billing Cycle",
      "Cycle Amount",
      "MRR Equivalent",
      "ARR Equivalent",
      "Currency",
      "Tax Profile",
      "Anchor Day",
      "Valid From",
      "Valid To",
      "Days Remaining",
    ];
    const rows = filteredContracts.map((c) => {
      const { daysRemaining } = getTenureMetrics(c);
      return [
        c.code,
        `"${c.title.replace(/"/g, '""')}"`,
        `"${c.clientName.replace(/"/g, '""')}"`,
        c.status.toUpperCase(),
        c.billingCycle,
        (c.amountMinor / 100).toFixed(2),
        (getMonthlyNormalizedMinor(c) / 100).toFixed(2),
        (getAnnualizedMinor(c) / 100).toFixed(2),
        c.currency || "INR",
        c.taxProfile.toUpperCase(),
        String(c.anchorDay),
        formatDate(c.validFrom),
        formatDate(c.validTo),
        String(daysRemaining),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsl-contracts-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredContracts.length} contract(s) to CSV`);
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
                Contracts &amp; Retainer Command Suite
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Executive ARR/MRR telemetry, tenure tracking, GST profiles, and automated cycle billing generation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3.5 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-800 shadow-xs transition cursor-pointer"
              data-testid="export-contracts-csv"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-tech">Export CSV</span>
            </button>

            <button
              onClick={() => {
                if (clients.length > 0 && !formData.clientId) {
                  setFormData((prev) => ({ ...prev, clientId: clients[0].id }));
                }
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              data-testid="new-contract-btn"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">New Contract</span>
            </button>
          </div>
        </div>

        {/* Executive Commercial Telemetry Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Active Contracts */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Total Active Contracts</span>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2 tabular-nums">
              {telemetry.activeCount}
              <span className="text-xs font-normal text-zinc-400 ml-1.5">/ {contracts.length} total</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Across {new Set(contracts.map((c) => c.clientId)).size} client tenant(s)
            </div>
          </div>

          {/* Annualized Recurring Revenue (ARR) */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Annualized Run-Rate (ARR)</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-2 tabular-nums">
              {formatCurrency(telemetry.arrMinor, "INR")}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Normalized annual contract value
            </div>
          </div>

          {/* Monthly Recurring Revenue (MRR) */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Normalized MRR</span>
              <Calendar className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2 tabular-nums">
              {formatCurrency(telemetry.mrrMinor, "INR")}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              Monthly recurring baseline
            </div>
          </div>

          {/* Expiring Within 60 Days */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">Expiring &le; 60 Days</span>
              <Clock className={`w-4 h-4 ${telemetry.expiring60Count > 0 ? "text-amber-500" : "text-zinc-400"}`} />
            </div>
            <div
              className={`text-fluid-kpi steel-kpi font-tech mt-2 tabular-nums ${
                telemetry.expiring60Count > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {telemetry.expiring60Count}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-sans">
              {telemetry.expiring60Count > 0 ? "Upcoming renewal pipeline" : "All tenures healthy"}
            </div>
          </div>

          {/* GST vs Non-GST Split */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <span className="steel-metric-label">GST vs Non-GST Split</span>
              <Percent className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-sm font-bold font-tech text-zinc-900 dark:text-zinc-100">
                {telemetry.gstCount} GST <span className="text-zinc-400 font-normal">/</span> {telemetry.nonGstCount} Non-GST
              </span>
              <span className="text-xs font-tech text-blue-600 dark:text-blue-400 font-semibold">
                {telemetry.gstPct}% Taxed
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mt-2.5 flex">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-full transition-all"
                style={{ width: `${telemetry.gstPct}%` }}
              />
              <div
                className="bg-emerald-500/70 h-full transition-all"
                style={{ width: `${100 - telemetry.gstPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Search, Filter & Sort Command Bar */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by contract code, title, or client name..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="contracts-search-input"
              />
            </div>

            {/* Client Tenant Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="contracts-client-filter"
              >
                <option value="all">All Client Tenants</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Billing Cycle Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="contracts-cycle-filter"
              >
                <option value="all">All Billing Cycles</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="half_yearly">Half-Yearly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One-Time</option>
              </select>
            </div>

            {/* Sort Option */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="contracts-sort-select"
              >
                <option value="newest">Sort: Newest Created</option>
                <option value="amount_desc">Sort: Value (High → Low)</option>
                <option value="expiry_asc">Sort: Renewal / Expiry Soonest</option>
                <option value="client_asc">Sort: Client Name (A → Z)</option>
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: "all", label: "All Agreements" },
                { key: "active", label: "Active" },
                { key: "expiring_soon", label: "Expiring Soon" },
                { key: "draft", label: "Draft" },
                { key: "expired", label: "Expired" },
                { key: "terminated", label: "Terminated" },
              ].map((st) => (
                <button
                  key={st.key}
                  onClick={() => setStatusFilter(st.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                    statusFilter === st.key
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                  data-testid={`contract-status-pill-${st.key}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-400 font-tech">
              Showing {filteredContracts.length} of {contracts.length} contract(s)
            </span>
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
                  <th className="steel-metric-label py-3.5 px-6">Tenure &amp; Renewal Countdown</th>
                  <th className="steel-metric-label py-3.5 px-6">Cycle / Value</th>
                  <th className="steel-metric-label py-3.5 px-6">Status</th>
                  <th className="steel-metric-label py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400 font-sans">
                      No contracts match your current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((contract) => {
                    const { progressPct, daysRemaining, isExpiringSoon, isOverdueRenewal } = getTenureMetrics(contract);
                    return (
                      <tr
                        key={contract.id}
                        onClick={() => setSelectedContract(contract)}
                        className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition cursor-pointer"
                        data-testid={`contract-row-${contract.id}`}
                      >
                        <td className="py-4 px-6">
                          <div className="font-bold font-steel text-zinc-900 dark:text-zinc-100">{contract.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-tech font-bold">
                              {contract.code}
                            </span>
                            <span
                              className={`text-[10px] font-tech uppercase px-1.5 py-0.5 rounded font-semibold ${
                                contract.taxProfile === "gst"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {contract.taxProfile === "gst" ? "GST 18%" : "Non-GST"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center text-[10px] font-bold font-tech">
                              {contract.clientName.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-sans">{contract.clientName}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs text-zinc-600 dark:text-zinc-400 font-tech min-w-[220px]">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {formatDate(contract.validFrom)} → {formatDate(contract.validTo)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden my-1">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isOverdueRenewal
                                  ? "bg-red-500"
                                  : isExpiringSoon
                                  ? "bg-amber-500"
                                  : "bg-blue-600 dark:bg-blue-500"
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] mt-1">
                            <span className="text-zinc-400">{progressPct}% elapsed</span>
                            {isOverdueRenewal ? (
                              <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">
                                Renewal Due ({Math.abs(daysRemaining)}d past)
                              </span>
                            ) : isExpiringSoon ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                                {daysRemaining} days remaining
                              </span>
                            ) : daysRemaining > 0 ? (
                              <span className="text-zinc-500">{daysRemaining} days remaining</span>
                            ) : (
                              <span className="text-zinc-400">Ended</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-bold font-tech text-zinc-900 dark:text-zinc-100 tabular-nums">
                            {formatCurrency(contract.amountMinor, contract.currency || "INR")}
                          </div>
                          <div className="text-xs text-zinc-500 capitalize font-sans">
                            {contract.billingCycle.replace(/_/g, " ")} (Anchor: Day {contract.anchorDay})
                          </div>
                          {contract.billingCycle !== "one_time" && (
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 font-tech mt-0.5">
                              ARR: {formatCurrency(getAnnualizedMinor(contract), contract.currency || "INR")}
                            </div>
                          )}
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
                        <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedContract(contract)}
                              className="inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-700 transition font-tech cursor-pointer"
                              title="Inspect Contract & Schedule"
                              data-testid={`inspect-contract-${contract.id}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-500" />
                              <span>Inspect</span>
                            </button>
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
                              <button
                                onClick={() => handleGenerateCycleInvoice(contract)}
                                disabled={generatingInvoiceId === contract.id}
                                className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-xs transition cursor-pointer font-tech"
                                title="Generate Invoice for Current Cycle"
                                data-testid={`generate-cycle-invoice-${contract.id}`}
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>{generatingInvoiceId === contract.id ? "Billing..." : "Bill Cycle"}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Interactive Contract Inspector Drawer */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-end">
          <div className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-xl h-full overflow-y-auto p-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-tech text-xs font-bold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
                      {selectedContract.code}
                    </span>
                    <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      {selectedContract.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-white mt-1.5">
                    {selectedContract.title}
                  </h3>
                  <p className="text-xs text-zinc-500">Client Tenant: {selectedContract.clientName}</p>
                </div>
                <button
                  onClick={() => setSelectedContract(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Commercial Valuation Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 block">Cycle Retainer</span>
                  <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-0.5 block">
                    {formatCurrency(selectedContract.amountMinor, selectedContract.currency)}
                  </span>
                  <span className="text-[10px] text-zinc-400 capitalize">
                    Per {selectedContract.billingCycle.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 block">Normalized MRR</span>
                  <span className="text-sm font-bold font-tech text-blue-600 dark:text-blue-400 mt-0.5 block">
                    {formatCurrency(getMonthlyNormalizedMinor(selectedContract), selectedContract.currency)}
                  </span>
                  <span className="text-[10px] text-zinc-400">Monthly baseline</span>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 block">Annualized Value</span>
                  <span className="text-sm font-bold font-tech text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                    {formatCurrency(getAnnualizedMinor(selectedContract), selectedContract.currency)}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {selectedContract.taxProfile === "gst" ? "+ 18% GST applicable" : "Bill of Supply (0% Tax)"}
                  </span>
                </div>
              </div>

              {/* Tenure Progress Card */}
              {(() => {
                const { progressPct, daysRemaining, isExpiringSoon, isOverdueRenewal } = getTenureMetrics(selectedContract);
                return (
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        Contract Tenure Progress
                      </span>
                      <span
                        className={`font-tech font-bold ${
                          isOverdueRenewal
                            ? "text-red-600"
                            : isExpiringSoon
                            ? "text-amber-600"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {daysRemaining > 0 ? `${daysRemaining} days remaining` : "Renewal Due"}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isOverdueRenewal ? "bg-red-500" : isExpiringSoon ? "bg-amber-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-500 font-tech">
                      <span>Start: {formatDate(selectedContract.validFrom)}</span>
                      <span>{progressPct}% Elapsed</span>
                      <span>End: {formatDate(selectedContract.validTo)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Billing Schedule Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Projected Billing Schedule (Anchor Day {selectedContract.anchorDay})
                  </h4>
                  <span className="text-[11px] font-tech text-zinc-400">
                    Tax Mode: {selectedContract.taxProfile.toUpperCase()}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Cycle</th>
                        <th className="py-2.5 px-3">Scheduled Date</th>
                        <th className="py-2.5 px-3 text-right">Base</th>
                        <th className="py-2.5 px-3 text-right">GST</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-tech">
                      {getProjectedSchedule(selectedContract).map((row) => (
                        <tr key={row.cycleIndex}>
                          <td className="py-2 px-3 font-semibold text-zinc-700 dark:text-zinc-300">
                            #{row.cycleIndex}
                          </td>
                          <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">{row.dateStr}</td>
                          <td className="py-2 px-3 text-right">
                            {formatCurrency(row.amountMinor, selectedContract.currency)}
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-500">
                            {formatCurrency(row.taxMinor, selectedContract.currency)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-zinc-900 dark:text-white">
                            {formatCurrency(row.totalMinor, selectedContract.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
              <a
                href={`/api/v1/billing/contracts/${selectedContract.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition font-tech"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>Download MSA PDF</span>
              </a>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {selectedContract.status === "draft" && (
                  <button
                    onClick={() => handleActivateContract(selectedContract.id, selectedContract.title)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>Activate Contract</span>
                  </button>
                )}
                <button
                  onClick={() => handleGenerateCycleInvoice(selectedContract)}
                  disabled={generatingInvoiceId === selectedContract.id}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer font-tech"
                  data-testid="drawer-generate-invoice-btn"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {generatingInvoiceId === selectedContract.id
                      ? "Generating Invoice..."
                      : "Generate Invoice for Current Cycle"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
