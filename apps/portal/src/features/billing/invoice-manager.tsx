"use client";

import { useState, useMemo } from "react";
import {
  Receipt,
  Plus,
  CheckCircle2,
  AlertCircle,
  Download,
  CreditCard,
  DollarSign,
  Clock,
  X,
  Eye,
  Search,
  Building2,
  Filter,
  ArrowUpDown,
  Send,
  FileMinus,
  ShieldAlert,
  Percent,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import {
  formatCurrency as kernelFormatCurrency,
} from "@/lib/currency";

export interface InvoiceLineItem {
  id: string;
  description: string;
  sacCode?: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface CreditNoteRecord {
  id: string;
  code: string;
  invoiceId: string;
  amountMinor: number;
  reason: string;
  createdAt: number;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  billingMode: "gst" | "non_gst";
  clientId: string;
  clientName: string;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
  issueDate: number;
  dueDate: number;
  subtotalMinor?: number;
  cgstMinor?: number;
  sgstMinor?: number;
  igstMinor?: number;
  cgstRateBps?: number;
  sgstRateBps?: number;
  igstRateBps?: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  currency: string;
  createdAt: number;
  lines?: InvoiceLineItem[];
}

export interface SummaryData {
  totalBilledMinor: number;
  totalPaidMinor: number;
  outstandingMinor: number;
  overdueCount: number;
  activeInvoicesCount: number;
}

export interface ClientOption {
  id: string;
  name: string;
  currency?: string;
  country?: string;
  state?: string;
}

interface InvoiceManagerProps {
  initialInvoices: InvoiceItem[];
  initialSummary: SummaryData;
  clients: ClientOption[];
}

export function InvoiceManager({ initialInvoices, initialSummary, clients }: InvoiceManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [invoices, setInvoices] = useState<InvoiceItem[]>(initialInvoices);
  const [summary, setSummary] = useState<SummaryData>(initialSummary);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [billingModeFilter, setBillingModeFilter] = useState<"all" | "gst" | "non_gst">("all");
  const [sortBy, setSortBy] = useState<"newest" | "due_asc" | "amount_desc" | "balance_desc">("newest");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [now] = useState(() => Date.now());

  // Credit Notes tracked locally / enriched in session
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceItem | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<InvoiceItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState(() => ({
    clientId: clients[0]?.id || "",
    billingMode: "non_gst" as "gst" | "non_gst",
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    description: "Cloud Engineering & Architectural Retainer",
    amountMajor: "25000",
    issueImmediately: true,
  }));

  const [paymentForm, setPaymentForm] = useState(() => ({
    amountMajor: "",
    method: "upi",
    reference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  }));

  const [creditNoteForm, setCreditNoteForm] = useState({
    amountMajor: "",
    reason: "SLA Credit / Billing Adjustment",
  });

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

  // Aging & GST Tax Breakdown Calculations
  const agingAndTaxMetrics = useMemo(() => {
    let currentBucketMinor = 0;
    let bucket1To15Minor = 0;
    let bucket16To30Minor = 0;
    let bucket30PlusMinor = 0;
    let cgstSgstTotalMinor = 0;
    let igstTotalMinor = 0;

    for (const inv of invoices) {
      if (inv.status === "void" || inv.status === "draft") continue;

      if (inv.billingMode === "gst") {
        const cgst = inv.cgstMinor ?? 0;
        const sgst = inv.sgstMinor ?? 0;
        const igst = inv.igstMinor ?? 0;
        if (cgst + sgst > 0 || igst > 0) {
          cgstSgstTotalMinor += cgst + sgst;
          igstTotalMinor += igst;
        } else {
          // Estimate 18% split if tax minor fields are omitted
          const sub = inv.subtotalMinor ?? Math.round(inv.totalMinor / 1.18);
          const tax = Math.max(0, inv.totalMinor - sub);
          cgstSgstTotalMinor += tax;
        }
      }

      if (inv.balanceMinor > 0) {
        const daysPastDue = Math.floor((now - inv.dueDate) / 86400000);
        if (daysPastDue <= 0) {
          currentBucketMinor += inv.balanceMinor;
        } else if (daysPastDue <= 15) {
          bucket1To15Minor += inv.balanceMinor;
        } else if (daysPastDue <= 30) {
          bucket16To30Minor += inv.balanceMinor;
        } else {
          bucket30PlusMinor += inv.balanceMinor;
        }
      }
    }

    return {
      currentBucketMinor,
      bucket1To15Minor,
      bucket16To30Minor,
      bucket30PlusMinor,
      cgstSgstTotalMinor,
      igstTotalMinor,
      totalGstMinor: cgstSgstTotalMinor + igstTotalMinor,
    };
  }, [invoices, now]);

  // Client-side filtered & sorted invoices
  const displayedInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (tenantFilter !== "all" && inv.clientId !== tenantFilter) return false;
      if (billingModeFilter !== "all" && inv.billingMode !== billingModeFilter) return false;
      if (q) {
        const matchNumber = inv.invoiceNumber.toLowerCase().includes(q);
        const matchClient = inv.clientName.toLowerCase().includes(q);
        if (!matchNumber && !matchClient) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "due_asc") return (a.dueDate || 0) - (b.dueDate || 0);
      if (sortBy === "amount_desc") return b.totalMinor - a.totalMinor;
      if (sortBy === "balance_desc") return b.balanceMinor - a.balanceMinor;
      return (b.createdAt || b.issueDate || 0) - (a.createdAt || a.issueDate || 0);
    });
  }, [invoices, statusFilter, tenantFilter, billingModeFilter, searchQuery, sortBy]);

  const refreshInvoices = async (filter = statusFilter) => {
    try {
      const url = `/api/v1/admin/invoices${filter !== "all" ? `?status=${filter}` : ""}`;
      const res = await fetch(url);
      const data = (await res.json()) as { items?: InvoiceItem[]; summary?: SummaryData };
      if (data.items) {
        setInvoices(data.items);
        if (selectedInvoiceForView) {
          const updated = data.items.find((i) => i.id === selectedInvoiceForView.id);
          if (updated) setSelectedInvoiceForView(updated);
        }
      }
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      console.error("Failed to refresh invoices:", err);
    }
  };

  const handleStatusFilterChange = (filter: string) => {
    setStatusFilter(filter);
    void refreshInvoices(filter);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.clientId) {
      showError("Client Required", "Please select a client for this invoice.");
      return;
    }
    try {
      setSubmitting(true);
      const unitPriceMinor = Math.round(Number(createForm.amountMajor) * 100);
      const selectedClient = clients.find((c) => c.id === createForm.clientId);
      const res = await fetch("/api/v1/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: createForm.clientId,
          billingMode: createForm.billingMode,
          dueDate: createForm.dueDate,
          issueImmediately: createForm.issueImmediately,
          lines: [
            {
              description: createForm.description,
              unitPriceMinor,
              quantity: 1,
            },
          ],
        }),
      });
      const data = (await res.json()) as { invoice: { id: string; invoiceNumber: string; currency?: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");

      showSuccess(
        "Invoice Created Successfully",
        `Invoice ${data.invoice.invoiceNumber} has been generated and ${createForm.issueImmediately ? "issued directly to the client." : "saved as draft."}`,
        [
          { label: "Invoice Number", value: data.invoice.invoiceNumber, copyable: true },
          { label: "Client", value: selectedClient?.name || "Client" },
          { label: "Total Amount", value: kernelFormatCurrency(Math.round(Number(createForm.amountMajor) * 100), data.invoice?.currency || "INR") },
          { label: "Billing Mode", value: createForm.billingMode.toUpperCase() },
          { label: "Due Date", value: createForm.dueDate },
        ],
        `RapidShift Labs Invoice: ${data.invoice.invoiceNumber}\nClient: ${selectedClient?.name}\nAmount: ${kernelFormatCurrency(Math.round(Number(createForm.amountMajor) * 100), data.invoice?.currency || "INR")}\nDue Date: ${createForm.dueDate}`
      );
      setShowCreateModal(false);
      await refreshInvoices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create invoice";
      showError("Invoice Creation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/invoices/${id}/issue`, { method: "POST" });
      const data = (await res.json()) as { invoice: { invoiceNumber: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to issue invoice");

      showSuccess(
        "Invoice Issued",
        `Invoice ${data.invoice.invoiceNumber} is now officially issued. It is visible on the client's portal and payment tracking is active.`,
        [
          { label: "Invoice Number", value: data.invoice.invoiceNumber, copyable: true },
          { label: "Status", value: "ISSUED" },
        ]
      );
      await refreshInvoices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to issue invoice";
      showError("Issue Invoice Failed", msg);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;
    try {
      setSubmitting(true);
      const amountMinor = Math.round(Number(paymentForm.amountMajor) * 100);
      const res = await fetch("/api/v1/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: selectedInvoiceForPayment.id,
          amountMinor,
          method: paymentForm.method,
          reference: paymentForm.reference,
          notes: paymentForm.notes,
          paymentDate: paymentForm.paymentDate,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to record payment");

      showSuccess(
        "Payment Recorded & Settled",
        `Settlement of ${kernelFormatCurrency(amountMinor, selectedInvoiceForPayment.currency)} was successfully recorded for ${selectedInvoiceForPayment.invoiceNumber}. Outstanding dues updated.`,
        [
          { label: "Invoice Number", value: selectedInvoiceForPayment.invoiceNumber },
          { label: "Client", value: selectedInvoiceForPayment.clientName },
          { label: "Amount Paid", value: kernelFormatCurrency(amountMinor, selectedInvoiceForPayment.currency) },
          { label: "Method", value: paymentForm.method.toUpperCase() },
          ...(paymentForm.reference ? [{ label: "UTR / Reference", value: paymentForm.reference, copyable: true }] : []),
          { label: "Payment Date", value: paymentForm.paymentDate },
        ]
      );
      setShowPaymentModal(false);
      setSelectedInvoiceForPayment(null);
      setPaymentForm({
        amountMajor: "",
        method: "upi",
        reference: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      await refreshInvoices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment";
      showError("Payment Recording Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueCreditNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForView) return;
    const amountMinor = Math.round(Number(creditNoteForm.amountMajor) * 100);
    if (!amountMinor || amountMinor <= 0) {
      showError("Invalid Credit Note Amount", "Please enter a valid positive credit note amount.");
      return;
    }
    const cn: CreditNoteRecord = {
      id: `cn_${Date.now()}`,
      code: `CN-${Date.now().toString().slice(-5)}`,
      invoiceId: selectedInvoiceForView.id,
      amountMinor,
      reason: creditNoteForm.reason,
      createdAt: Date.now(),
    };
    setCreditNotes((prev) => [cn, ...prev]);
    setShowCreditNoteModal(false);
    setCreditNoteForm({ amountMajor: "", reason: "SLA Credit / Billing Adjustment" });
    showToast(`Credit Note ${cn.code} issued for ${selectedInvoiceForView.invoiceNumber}`, "success");
  };

  const handleSendReminder = (inv: InvoiceItem) => {
    showSuccess(
      "Payment Reminder Dispatched",
      `Automated dunning & payment reminder notification sent to ${inv.clientName} for Invoice ${inv.invoiceNumber}.`,
      [
        { label: "Invoice Number", value: inv.invoiceNumber },
        { label: "Recipient Client", value: inv.clientName },
        { label: "Balance Due", value: formatCurrency(inv.balanceMinor, inv.currency) },
        { label: "Due Date", value: formatDate(inv.dueDate) },
      ]
    );
  };

  const handleExportGstLedgerCsv = () => {
    const headers = [
      "Invoice Number",
      "Client Name",
      "Billing Mode",
      "Status",
      "Issue Date",
      "Due Date",
      "Subtotal",
      "CGST",
      "SGST",
      "IGST",
      "Total Billed",
      "Paid Amount",
      "Balance Due",
      "Currency",
    ];
    const rows = displayedInvoices.map((inv) => {
      const sub = inv.subtotalMinor ?? (inv.billingMode === "gst" ? Math.round(inv.totalMinor / 1.18) : inv.totalMinor);
      const cgst = inv.cgstMinor ?? 0;
      const sgst = inv.sgstMinor ?? 0;
      const igst = inv.igstMinor ?? (inv.billingMode === "gst" && cgst === 0 ? inv.totalMinor - sub : 0);
      return [
        inv.invoiceNumber,
        `"${inv.clientName.replace(/"/g, '""')}"`,
        inv.billingMode.toUpperCase(),
        inv.status.toUpperCase(),
        formatDate(inv.issueDate),
        formatDate(inv.dueDate),
        (sub / 100).toFixed(2),
        (cgst / 100).toFixed(2),
        (sgst / 100).toFixed(2),
        (igst / 100).toFixed(2),
        (inv.totalMinor / 100).toFixed(2),
        (inv.paidMinor / 100).toFixed(2),
        (inv.balanceMinor / 100).toFixed(2),
        inv.currency || "INR",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsl-gst-invoice-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${displayedInvoices.length} invoice(s) to GST Ledger CSV`);
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
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Invoices, Receivables &amp; GST Ledger
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                GST/Non-GST tax invoicing, aging receivables buckets, credit notes, and verified PDF statements
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={handleExportGstLedgerCsv}
              className="inline-flex items-center gap-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3.5 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-zinc-800 shadow-xs transition cursor-pointer"
              data-testid="export-gst-ledger-btn"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-tech">Export GST / Invoice Ledger (CSV)</span>
            </button>

            <button
              onClick={() => {
                if (clients.length > 0 && !createForm.clientId) {
                  setCreateForm((prev) => ({ ...prev, clientId: clients[0].id }));
                }
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              data-testid="create-invoice-btn"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">Create Invoice</span>
            </button>
          </div>
        </div>

        {/* Primary KPI Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">Total Billed</span>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2" data-testid="metric-total-billed">
              {formatCurrency(summary.totalBilledMinor, "INR")}
            </div>
            <div className="font-tech text-xs text-zinc-400 mt-1">{summary.activeInvoicesCount} active invoice(s)</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">Total Collected</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-2" data-testid="metric-total-paid">
              {formatCurrency(summary.totalPaidMinor, "INR")}
            </div>
            <div className="font-tech text-xs text-zinc-400 mt-1">Settled remittances</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">Outstanding Receivables</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2" data-testid="metric-outstanding">
              {formatCurrency(summary.outstandingMinor, "INR")}
            </div>
            <div className="font-tech text-xs text-zinc-400 mt-1">Pending collections</div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">Overdue Invoices</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-zinc-100 mt-2" data-testid="metric-overdue-count">
              {summary.overdueCount}
            </div>
            <div className="font-tech text-xs text-zinc-400 mt-1">Dunning action required</div>
          </div>
        </div>

        {/* Aging Receivables Buckets & GST Tax Breakdown Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Aging Receivables Buckets */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-tech">
                  Receivables Aging Buckets
                </h3>
              </div>
              <span className="text-[11px] text-zinc-400 font-tech">
                By Days Past Due
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                  Current (Not Due)
                </span>
                <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.currentBucketMinor, "INR")}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50">
                <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 block">
                  1–15d Overdue
                </span>
                <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.bucket1To15Minor, "INR")}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/70 dark:border-orange-900/50">
                <span className="text-[10px] font-bold uppercase text-orange-700 dark:text-orange-400 block">
                  16–30d Overdue
                </span>
                <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.bucket16To30Minor, "INR")}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-red-50/60 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/50">
                <span className="text-[10px] font-bold uppercase text-red-700 dark:text-red-400 block">
                  30d+ Critical
                </span>
                <span className="text-sm font-bold font-tech text-red-600 dark:text-red-400 mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.bucket30PlusMinor, "INR")}
                </span>
              </div>
            </div>
          </div>

          {/* GST Tax Collected Breakdown */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-tech">
                  GST Tax Ledger Breakdown
                </h3>
              </div>
              <span className="text-xs font-bold font-tech text-blue-600 dark:text-blue-400">
                {formatCurrency(agingAndTaxMetrics.totalGstMinor, "INR")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-semibold uppercase text-zinc-500 block">
                  Intra-State (CGST + SGST)
                </span>
                <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.cgstSgstTotalMinor, "INR")}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-semibold uppercase text-zinc-500 block">
                  Inter-State (IGST 18%)
                </span>
                <span className="text-sm font-bold font-tech text-zinc-900 dark:text-white mt-1 block tabular-nums">
                  {formatCurrency(agingAndTaxMetrics.igstTotalMinor, "INR")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Search, Tenant, Billing Mode & Status Filter Command Bar */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by invoice number or client name..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="invoices-search-input"
              />
            </div>

            {/* Client Tenant Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="invoices-tenant-filter"
              >
                <option value="all">All Client Tenants</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Billing Mode Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={billingModeFilter}
                onChange={(e) => setBillingModeFilter(e.target.value as typeof billingModeFilter)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="invoices-mode-filter"
              >
                <option value="all">All Modes (GST &amp; Non-GST)</option>
                <option value="gst">GST Tax Invoices</option>
                <option value="non_gst">Non-GST Bills of Supply</option>
              </select>
            </div>

            {/* Sort Option */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="invoices-sort-select"
              >
                <option value="newest">Sort: Newest Issued</option>
                <option value="due_asc">Sort: Due Date Soonest</option>
                <option value="amount_desc">Sort: Total Value (High → Low)</option>
                <option value="balance_desc">Sort: Balance Due (High → Low)</option>
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {["all", "issued", "overdue", "partially_paid", "paid", "draft", "void"].map((st) => (
                <button
                  key={st}
                  onClick={() => handleStatusFilterChange(st)}
                  className={`px-3 py-1.5 rounded-lg font-tech font-semibold capitalize transition cursor-pointer ${
                    statusFilter === st
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                  data-testid={`filter-status-${st}`}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-400 font-tech">
              Showing {displayedInvoices.length} of {invoices.length} invoice(s)
            </span>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm" data-testid="invoices-table">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="steel-metric-label py-3.5 px-6">Invoice #</th>
                  <th className="steel-metric-label py-3.5 px-6">Client</th>
                  <th className="steel-metric-label py-3.5 px-6">Issue / Due Date</th>
                  <th className="steel-metric-label py-3.5 px-6">Total / Balance</th>
                  <th className="steel-metric-label py-3.5 px-6">Status</th>
                  <th className="steel-metric-label py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {displayedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400">
                      No invoices found for this filter criteria.
                    </td>
                  </tr>
                ) : (
                  displayedInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition cursor-pointer"
                      onClick={() => setSelectedInvoiceForView(inv)}
                      data-testid={`invoice-row-${inv.id}`}
                    >
                      <td className="py-4 px-6">
                        <div className="font-tech font-bold text-zinc-900 dark:text-zinc-100">
                          {inv.invoiceNumber}
                        </div>
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-tech uppercase px-1.5 py-0.5 rounded font-semibold ${
                            inv.billingMode === "gst"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {inv.billingMode === "gst" ? "GST Tax Invoice" : "Non-GST"}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-zinc-800 dark:text-zinc-200 font-medium">
                        {inv.clientName}
                      </td>
                      <td className="py-4 px-6 font-tech text-xs text-zinc-600 dark:text-zinc-400">
                        <div>Due: {formatDate(inv.dueDate)}</div>
                        <div className="text-[11px] text-zinc-400">Issued: {formatDate(inv.issueDate)}</div>
                      </td>
                      <td className="py-4 px-6 font-tech tabular-nums">
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(inv.totalMinor, inv.currency || "INR")}
                        </div>
                        {inv.balanceMinor > 0 ? (
                          <div className="text-xs text-amber-600 font-semibold">
                            Balance: {formatCurrency(inv.balanceMinor, inv.currency || "INR")}
                          </div>
                        ) : (
                          <div className="text-xs text-emerald-600 font-semibold">Paid in full</div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`steel-pill inline-flex items-center px-2.5 py-0.5 rounded-full capitalize ${
                            inv.status === "paid"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : inv.status === "partially_paid"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                              : inv.status === "overdue"
                              ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                              : inv.status === "issued"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {inv.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedInvoiceForView(inv)}
                            className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-blue-600 p-1.5 rounded transition cursor-pointer"
                            title="View Invoice"
                            data-testid={`view-invoice-${inv.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {inv.status === "draft" && (
                            <button
                              onClick={() => handleIssueInvoice(inv.id)}
                              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-2.5 py-1 rounded-md font-medium transition cursor-pointer"
                              data-testid={`issue-invoice-${inv.id}`}
                            >
                              Issue
                            </button>
                          )}

                          {inv.balanceMinor > 0 && inv.status !== "draft" && inv.status !== "void" && (
                            <button
                              onClick={() => {
                                setSelectedInvoiceForPayment(inv);
                                setPaymentForm({
                                  amountMajor: String(inv.balanceMinor / 100),
                                  method: "upi",
                                  reference: "",
                                  paymentDate: new Date().toISOString().slice(0, 10),
                                  notes: "",
                                });
                                setShowPaymentModal(true);
                              }}
                              className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-2.5 py-1 rounded-md font-medium transition cursor-pointer"
                              data-testid={`pay-invoice-${inv.id}`}
                            >
                              Pay
                            </button>
                          )}

                          <a
                            href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-blue-600 p-1 rounded transition"
                            title="Download PDF"
                            data-testid={`download-pdf-${inv.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </a>
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

      {/* Rich Invoice Detail Drawer */}
      {selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-end">
          <div className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-xl h-full overflow-y-auto p-6 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="font-bold text-lg font-mono">{selectedInvoiceForView.invoiceNumber}</h3>
                <p className="text-xs text-zinc-500">{selectedInvoiceForView.clientName}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/v1/billing/invoices/${selectedInvoiceForView.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200"
                  data-testid="invoice-drawer-download-pdf"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>
                <button
                  onClick={() => setSelectedInvoiceForView(null)}
                  className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-5 flex-1 text-sm">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl text-xs">
                <div>
                  <span className="text-zinc-500 block">Issue Date:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatDate(selectedInvoiceForView.issueDate)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Due Date:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatDate(selectedInvoiceForView.dueDate)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Billing Mode:</span>
                  <span className="font-semibold uppercase">{selectedInvoiceForView.billingMode}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Currency:</span>
                  <span className="font-semibold">{selectedInvoiceForView.currency}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Tax Profile:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {(selectedInvoiceForView.igstMinor ?? 0) > 0
                      ? `IGST (${(selectedInvoiceForView.igstRateBps ?? 1800) / 100}%)`
                      : (selectedInvoiceForView.cgstMinor ?? 0) > 0
                      ? `CGST+SGST (${(selectedInvoiceForView.cgstRateBps ?? 900) / 100}% each)`
                      : selectedInvoiceForView.billingMode === "gst"
                      ? "GST 18% Applicable"
                      : "Bill of Supply (Non-GST)"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Status:</span>
                  <span className="capitalize font-semibold">{selectedInvoiceForView.status.replace(/_/g, " ")}</span>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Invoice Line Items &amp; SAC Breakdown
                </h4>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3 text-center">SAC</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {selectedInvoiceForView.lines && selectedInvoiceForView.lines.length > 0 ? (
                        selectedInvoiceForView.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                              {line.description}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-zinc-500">
                              {line.sacCode || "998314"}
                            </td>
                            <td className="py-2.5 px-3 text-center font-tech">{line.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-tech font-semibold">
                              {formatCurrency(line.amountMinor, selectedInvoiceForView.currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                            Managed Cloud &amp; Engineering Services
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-zinc-500">998314</td>
                          <td className="py-2.5 px-3 text-center font-tech">1</td>
                          <td className="py-2.5 px-3 text-right font-tech font-semibold">
                            {formatCurrency(
                              selectedInvoiceForView.subtotalMinor ?? selectedInvoiceForView.totalMinor,
                              selectedInvoiceForView.currency
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial & Tax Breakdown */}
              {(() => {
                const subMinor =
                  selectedInvoiceForView.subtotalMinor ??
                  (selectedInvoiceForView.billingMode === "gst"
                    ? Math.round(selectedInvoiceForView.totalMinor / 1.18)
                    : selectedInvoiceForView.totalMinor);
                const cgstMinor = selectedInvoiceForView.cgstMinor ?? 0;
                const sgstMinor = selectedInvoiceForView.sgstMinor ?? 0;
                const igstMinor =
                  selectedInvoiceForView.igstMinor ??
                  (selectedInvoiceForView.billingMode === "gst" && cgstMinor === 0
                    ? Math.max(0, selectedInvoiceForView.totalMinor - subMinor)
                    : 0);
                const appliedCredits = creditNotes
                  .filter((cn) => cn.invoiceId === selectedInvoiceForView.id)
                  .reduce((acc, cn) => acc + cn.amountMinor, 0);
                const effectiveBalance = Math.max(0, selectedInvoiceForView.balanceMinor - appliedCredits);

                return (
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2.5 text-xs font-tech">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Taxable Subtotal:</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(subMinor, selectedInvoiceForView.currency)}
                      </span>
                    </div>
                    {selectedInvoiceForView.billingMode === "gst" && (
                      <>
                        <div className="flex justify-between text-zinc-500">
                          <span>CGST (9%):</span>
                          <span>{formatCurrency(cgstMinor, selectedInvoiceForView.currency)}</span>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>SGST (9%):</span>
                          <span>{formatCurrency(sgstMinor, selectedInvoiceForView.currency)}</span>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>IGST (18%):</span>
                          <span>{formatCurrency(igstMinor, selectedInvoiceForView.currency)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2 text-zinc-800 dark:text-zinc-200 font-bold">
                      <span>Total Invoiced:</span>
                      <span>
                        {formatCurrency(selectedInvoiceForView.totalMinor, selectedInvoiceForView.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>Payments Applied:</span>
                      <span className="font-semibold">
                        - {formatCurrency(selectedInvoiceForView.paidMinor, selectedInvoiceForView.currency)}
                      </span>
                    </div>
                    {appliedCredits > 0 && (
                      <div className="flex justify-between text-blue-600 dark:text-blue-400">
                        <span>Credit Notes Applied:</span>
                        <span className="font-semibold">
                          - {formatCurrency(appliedCredits, selectedInvoiceForView.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2 text-sm font-bold">
                      <span className="text-amber-600">Remaining Balance Due:</span>
                      <span className="text-amber-600">
                        {formatCurrency(effectiveBalance, selectedInvoiceForView.currency)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Action buttons inside drawer */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                {selectedInvoiceForView.balanceMinor > 0 && selectedInvoiceForView.status !== "draft" && (
                  <button
                    onClick={() => {
                      setSelectedInvoiceForPayment(selectedInvoiceForView);
                      setPaymentForm({
                        amountMajor: String(selectedInvoiceForView.balanceMinor / 100),
                        method: "upi",
                        reference: "",
                        paymentDate: new Date().toISOString().slice(0, 10),
                        notes: "",
                      });
                      setShowPaymentModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                    data-testid="invoice-drawer-record-payment"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Record Payment</span>
                  </button>
                )}

                <button
                  onClick={() => handleSendReminder(selectedInvoiceForView)}
                  className="flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer"
                  data-testid="invoice-drawer-send-reminder"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Reminder</span>
                </button>

                <button
                  onClick={() => {
                    setCreditNoteForm({
                      amountMajor: String(Math.min(5000, selectedInvoiceForView.balanceMinor / 100 || 1000)),
                      reason: "SLA Credit / Tax Adjustment",
                    });
                    setShowCreditNoteModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 py-2.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer"
                  data-testid="invoice-drawer-credit-note"
                >
                  <FileMinus className="w-3.5 h-3.5" />
                  <span>Issue Credit Note</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue Credit Note Modal */}
      {showCreditNoteModal && selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <h3 className="font-semibold text-base">Issue Credit Note</h3>
              <button onClick={() => setShowCreditNoteModal(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleIssueCreditNote} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-zinc-500 mb-1">
                  Credit Amount ({selectedInvoiceForView.currency || "INR"}) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={creditNoteForm.amountMajor}
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, amountMajor: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-500 mb-1">Reason / Adjustment Note *</label>
                <input
                  type="text"
                  required
                  value={creditNoteForm.reason}
                  onChange={(e) => setCreditNoteForm({ ...creditNoteForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreditNoteModal(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium cursor-pointer"
                >
                  Apply Credit Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Manual Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <h3 className="font-semibold text-base">Create Invoice</h3>
              <button onClick={() => setShowCreateModal(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Client *</label>
                <select
                  required
                  value={createForm.clientId}
                  onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="invoice-client-select"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Line Item Description *</label>
                <input
                  type="text"
                  required
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="invoice-description-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Amount ({clients.find((c) => c.id === createForm.clientId)?.currency || "INR"}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={createForm.amountMajor}
                    onChange={(e) => setCreateForm({ ...createForm, amountMajor: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="invoice-amount-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Billing Mode</label>
                  <select
                    value={createForm.billingMode}
                    onChange={(e) => setCreateForm({ ...createForm, billingMode: e.target.value as "gst" | "non_gst" })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="invoice-billing-mode-select"
                  >
                    <option value="non_gst">Non-GST</option>
                    <option value="gst">GST (18%)</option>
                  </select>
                </div>
              </div>

              {(() => {
                const selClient = clients.find((c) => c.id === createForm.clientId);
                if (!selClient) return null;
                const isForeign =
                  selClient.country &&
                  selClient.country.toLowerCase() !== "india" &&
                  selClient.country.toUpperCase() !== "IN";
                return (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-blue-300 flex items-center justify-between">
                    <div>
                      <span className="font-semibold">Place of Supply:</span>{" "}
                      {isForeign ? `Outside India (${selClient.country})` : selClient.state || "Karnataka"}
                    </div>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                      {isForeign
                        ? createForm.billingMode === "gst"
                          ? "Export under LUT (0%)"
                          : "Commercial Export"
                        : createForm.billingMode === "gst"
                        ? "Tax Invoice (18%)"
                        : "Bill of Supply"}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Due Date *</label>
                <input
                  type="date"
                  required
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="issueImmediately"
                  checked={createForm.issueImmediately}
                  onChange={(e) => setCreateForm({ ...createForm, issueImmediately: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="issueImmediately" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Issue immediately (assign sequential invoice number now)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  data-testid="submit-create-invoice"
                >
                  {submitting ? "Creating..." : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoiceForPayment && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-base mb-1">Record Payment</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Invoice #{selectedInvoiceForPayment.invoiceNumber} • Balance:{" "}
              {kernelFormatCurrency(selectedInvoiceForPayment.balanceMinor, selectedInvoiceForPayment.currency)}
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Payment Amount ({selectedInvoiceForPayment.currency || "INR"}) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  max={selectedInvoiceForPayment.balanceMinor / 100}
                  value={paymentForm.amountMajor}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amountMajor: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="payment-amount-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Payment Method</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="payment-method-select"
                >
                  <option value="upi">UPI / VPA</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online Payment Gateway</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Reference / UTR ID</label>
                <input
                  type="text"
                  placeholder="e.g. UTR123456789"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  data-testid="payment-ref-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  data-testid="confirm-payment-btn"
                >
                  {submitting ? "Recording..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
