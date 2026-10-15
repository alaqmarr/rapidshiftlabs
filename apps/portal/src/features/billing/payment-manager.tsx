"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  ArrowLeft,
  Plus,
  Receipt,
  DollarSign,
  TrendingUp,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { formatDate, formatCurrency } from "@/lib/format";

export interface PaymentItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amountMinor: number;
  method: string;
  paymentDate: number;
  reference?: string;
  notes?: string;
  recordedBy?: string;
  createdAt: number;
}

export interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  clientName: string;
  balanceMinor: number;
  totalMinor: number;
  status: string;
}

interface PaymentManagerProps {
  initialPayments: PaymentItem[];
  invoices: InvoiceOption[];
}

export function PaymentManager({ initialPayments, invoices: initialInvoiceOptions }: PaymentManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [payments, setPayments] = useState<PaymentItem[]>(initialPayments);
  const [invoices, setInvoices] = useState<InvoiceOption[]>(initialInvoiceOptions);
  const [methodFilter, setMethodFilter] = useState("all");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Record Payment Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentForm, setPaymentForm] = useState(() => ({
    invoiceId: initialInvoiceOptions[0]?.id || "",
    amountMajor: initialInvoiceOptions[0] ? (initialInvoiceOptions[0].balanceMinor / 100).toFixed(2) : "",
    method: "upi",
    reference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  }));

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const refreshPayments = async () => {
    try {
      const [payRes, invRes] = await Promise.all([
        fetch("/api/v1/admin/payments"),
        fetch("/api/v1/admin/invoices"),
      ]);
      const payData = (await payRes.json()) as { items?: PaymentItem[] };
      const invData = (await invRes.json()) as { items?: Array<InvoiceOption & { clientName: string }> };

      if (payData.items) setPayments(payData.items);
      if (invData.items) {
        const eligible = invData.items
          .filter((i) => i.status === "issued" || i.status === "partially_paid" || i.status === "overdue")
          .map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            clientName: i.clientName,
            balanceMinor: i.balanceMinor,
            totalMinor: i.totalMinor,
            status: i.status,
          }));
        setInvoices(eligible);
      }
    } catch (err) {
      console.error("Failed to refresh payments:", err);
    }
  };

  const handleInvoiceChange = (invId: string) => {
    const inv = invoices.find((i) => i.id === invId);
    setPaymentForm((prev) => ({
      ...prev,
      invoiceId: invId,
      amountMajor: inv ? (inv.balanceMinor / 100).toFixed(2) : "",
    }));
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.invoiceId) {
      showError("Invoice Required", "Please select an invoice to record payment against.");
      return;
    }

    const amountMinor = Math.round(Number(paymentForm.amountMajor) * 100);
    if (!amountMinor || amountMinor <= 0) {
      showError("Invalid Amount", "Please enter a valid payment amount greater than zero.");
      return;
    }

    try {
      setSubmitting(true);
      const targetInvoice = invoices.find((i) => i.id === paymentForm.invoiceId);
      const res = await fetch("/api/v1/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: paymentForm.invoiceId,
          amountMinor,
          method: paymentForm.method,
          reference: paymentForm.reference || undefined,
          notes: paymentForm.notes || undefined,
          paymentDate: paymentForm.paymentDate,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to record payment");
      }

      showSuccess(
        "Settlement Recorded Successfully",
        `Payment of ${formatCurrency(amountMinor, (targetInvoice as any)?.currency || "INR")} was successfully recorded and credited against ${targetInvoice?.invoiceNumber || "Invoice"}.`,
        [
          { label: "Invoice Number", value: targetInvoice?.invoiceNumber || "Invoice" },
          { label: "Client", value: targetInvoice?.clientName || "Client" },
          { label: "Amount Settled", value: formatCurrency(amountMinor, (targetInvoice as any)?.currency || "INR") },
          { label: "Payment Mode", value: paymentForm.method.toUpperCase() },
          ...(paymentForm.reference ? [{ label: "UTR / Reference", value: paymentForm.reference, copyable: true }] : []),
          { label: "Payment Date", value: paymentForm.paymentDate },
        ]
      );
      setShowModal(false);
      setPaymentForm({
        invoiceId: invoices[0]?.id || "",
        amountMajor: invoices[0] ? (invoices[0].balanceMinor / 100).toFixed(2) : "",
        method: "upi",
        reference: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      await refreshPayments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment";
      showError("Payment Recording Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics
  const totalCollectedMinor = payments.reduce((acc, p) => acc + p.amountMinor, 0);
  const upiCount = payments.filter((p) => p.method === "upi").length;
  const bankCount = payments.filter((p) => ["neft", "rtgs", "bank_transfer"].includes(p.method)).length;

  const filteredPayments = payments.filter((p) => {
    if (methodFilter === "all") return true;
    return p.method.toLowerCase() === methodFilter.toLowerCase();
  });


  const getMethodBadgeClass = (m: string) => {
    switch (m.toLowerCase()) {
      case "upi":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "neft":
      case "rtgs":
      case "bank_transfer":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "card":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      default:
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/80 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800"
          }`}
          data-testid="toast-notification"
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Payment Collections
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Track collections, audit UTR/references, and record incoming remittances
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
            data-testid="record-payment-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
              <span>Total Collections</span>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
              data-testid="metric-total-collections"
            >
              {formatCurrency(totalCollectedMinor)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Cumulative incoming cash flow
            </p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
              <span>Recorded Transactions</span>
              <Receipt className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
              data-testid="metric-total-tx"
            >
              {payments.length}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Verified receipts logged
            </p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
              <span>UPI Collections</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
              data-testid="metric-upi-count"
            >
              {upiCount} tx
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Direct VPA instant settlements
            </p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
              <span>NEFT / RTGS Wire</span>
              <Building2 className="w-4 h-4 text-blue-500" />
            </div>
            <div
              className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"
              data-testid="metric-bank-count"
            >
              {bankCount} tx
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Corporate bank wire transfers
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Filter by Method:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {["all", "upi", "neft", "rtgs", "card", "bank_transfer"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMethodFilter(m)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer capitalize ${
                    methodFilter === m
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                  data-testid={`filter-method-${m}`}
                >
                  {m === "all" ? "All Methods" : m.replace("_", " ").toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing <span className="font-semibold text-zinc-900 dark:text-white">{filteredPayments.length}</span>{" "}
            of {payments.length} transactions
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          {filteredPayments.length === 0 ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No payment transactions found
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                No remittances have been recorded yet. Click &quot;Record Payment&quot; to apply a transaction against an active invoice.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="payments-table">
                <thead className="bg-zinc-50/75 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                  <tr>
                    <th className="px-4 py-3">Receipt / ID</th>
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Reference / UTR</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`payment-row-${p.id}`}
                    >
                      <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.id.slice(0, 16)}...
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-white">
                        {p.clientName}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          href="/admin/invoices"
                          className="font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Receipt className="w-3 h-3" />
                          <span>{p.invoiceNumber}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${getMethodBadgeClass(
                            p.method,
                          )}`}
                        >
                          {p.method}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                        {p.reference || <span className="text-zinc-400 italic">None</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-zinc-900 dark:text-white">
                        {formatCurrency(p.amountMinor)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400 capitalize">
                        {p.recordedBy || "admin"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Record Payment Remittance
                  </h3>
                  <p className="text-xs text-zinc-500">Apply a collected payment against an invoice</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Select Target Invoice
                </label>
                {invoices.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900">
                    No open or overdue invoices available to receive payments.
                  </p>
                ) : (
                  <select
                    value={paymentForm.invoiceId}
                    onChange={(e) => handleInvoiceChange(e.target.value)}
                    className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                    data-testid="payment-invoice-select"
                  >
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.clientName} (Balance: ₹
                        {(inv.balanceMinor / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Amount (INR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={paymentForm.amountMajor}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, amountMajor: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0.00"
                    required
                    data-testid="payment-amount-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, method: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="payment-method-select"
                  >
                    <option value="upi">UPI / VPA</option>
                    <option value="neft">NEFT Bank Transfer</option>
                    <option value="rtgs">RTGS Instant Wire</option>
                    <option value="bank_transfer">Direct Bank Transfer</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Reference / UTR / Tx ID
                  </label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, reference: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    placeholder="e.g. UTR10928374928"
                    data-testid="payment-ref-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                    data-testid="payment-date-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Internal Notes / Memo (Optional)
                </label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. Cleared via HDFC Corporate Account"
                  data-testid="payment-notes-input"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || invoices.length === 0}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  data-testid="payment-submit-btn"
                >
                  {submitting ? (
                    <>
                      <IosSpinner size="xs" className="text-white" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      <span>Confirm Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
