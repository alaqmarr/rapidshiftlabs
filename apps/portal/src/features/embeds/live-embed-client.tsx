"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import {
  CreditCard,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCw,
  Server,
  Activity,
  Terminal,
  LifeBuoy,
  Send,
  Plus,
  X,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  Check,
  ArrowRight,
  Sparkles,
  Key,
  Search,
  FileText,
  Receipt,
  Globe,
  Lock,
  Rocket,
  BarChart3,
  Code2,
  Calendar,
} from "lucide-react";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { calculateContractTenure, getBillingCycleLabel } from "@/lib/contract-tenure";

export interface LiveEmbedProps {
  widget: string;
  widgetTitle: string;
  widgetDescription: string;
  clientId: string;
  clientName: string;
  token?: string;
  isDark?: boolean;
  accent?: string;
  initialData: {
    invoices: any[];
    payments: any[];
    summary: {
      outstandingMinor: number;
      totalBilledMinor: number;
      totalPaidMinor: number;
      overdueMinor: number;
      unpaidCount: number;
    };
    processes: any[];
    domains: any[];
    tickets: any[];
    credentials: any[];
    releases: any[];
    contracts?: any[];
    analytics?: {
      pageviews: number;
      visitors: number;
      repeatVisitors?: number;
      repeatRate?: number;
      bounceRate: number;
      activeVisitorsNow?: number;
      avgDurationSec?: number;
      avgLcpMs?: number | null;
      topPaths?: Array<{ key: string; count: number; uniqueVisitors?: number }>;
      topReferrers?: Array<{ key: string; count: number }>;
      countries?: Array<{ key: string; count: number }>;
      webVitals?: Array<{
        name: string;
        p75Value: number;
        rating: "good" | "needs-improvement" | "poor";
        sampleCount: number;
      }>;
      timeseries?: Array<{
        timestamp: number;
        date: string;
        pageviews: number;
        uniqueVisitors: number;
        repeatVisitors: number;
        sessions: number;
      }>;
      visitorSessions?: Array<{
        sessionId: string;
        visitorHash: string;
        isRepeatViewer: boolean;
        visitNumber: number;
        country: string;
        referrer: string;
        entryPage: string;
        pageviewCount: number;
        browser: string;
        os: string;
      }>;
    };
  };
}

// =========================================================================
// DETERMINISTIC FORMATTERS (Prevents Server vs Client Hydration Mismatches)
// =========================================================================
function formatDate(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function formatTime(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const mins = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${mins} UTC`;
}

function formatDateTime(timestamp: number | string | Date | null | undefined): string {
  if (!timestamp) return "—";
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
}

function formatMinorToINR(minor: number = 0): string {
  const rupees = Math.floor(Math.abs(minor) / 100);
  const paise = Math.abs(minor) % 100;
  const s = rupees.toString();
  let grouped = "";
  if (s.length <= 3) {
    grouped = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${withCommas},${last3}`;
  }
  const prefix = minor < 0 ? "-" : "";
  return paise > 0 ? `${prefix}${grouped}.${String(paise).padStart(2, "0")}` : `${prefix}${grouped}`;
}

function formatNumber(num: number = 0): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatUptime(uptimeMs: number | null | undefined): string {
  if (!uptimeMs || uptimeMs <= 0) return "0m";
  const totalSec = Math.floor(uptimeMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${ Math.max(1, mins)}m`;
}

// =========================================================================
// MAIN EMBED COMPONENT
// =========================================================================
function normalizeEntity(item: any): any {
  if (!item) return item;
  if (item.props && typeof item.props === "object") {
    return { ...item.props, ...item, id: item.id || item.props.id };
  }
  return item;
}

export function LiveEmbedClient({
  widget,
  widgetTitle,
  widgetDescription,
  clientId,
  clientName,
  token = "",
  isDark = true,
  accent = "#2563eb",
  initialData,
}: LiveEmbedProps) {
  // State for all data slices
  const [invoices, setInvoices] = useState<any[]>(() => (initialData.invoices || []).map(normalizeEntity));
  const [payments, setPayments] = useState<any[]>(() => (initialData.payments || []).map(normalizeEntity));
  const [summary, setSummary] = useState(initialData.summary);
  const [processes, setProcesses] = useState<any[]>(() => (initialData.processes || []).map(normalizeEntity));
  const [domains, setDomains] = useState<any[]>(() => (initialData.domains || []).map(normalizeEntity));
  const [tickets, setTickets] = useState<any[]>(() => (initialData.tickets || []).map(normalizeEntity));
  const [credentials, setCredentials] = useState<any[]>(() => (initialData.credentials || []).map(normalizeEntity));
  const [releases, setReleases] = useState<any[]>(() => (initialData.releases || []).map(normalizeEntity));
  const [contracts] = useState<any[]>(() => (initialData.contracts || []).map(normalizeEntity));
  const [analytics] = useState(
    initialData.analytics || { pageviews: 0, visitors: 0, bounceRate: 0, topPaths: [] }
  );

  // Mounted flag to safely gate client-only APIs
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Filter & Search states
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

  // In-place modals & interactive action states
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<any | null>(null);
  const [logContent, setLogContent] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState<string>("");
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerAlert, setBannerAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // New Ticket Form State
  const [newTicketForm, setNewTicketForm] = useState({
    subject: "",
    priority: "P2",
    category: "question",
    message: "",
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Payment execution & self-service renewal state
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [paymentReceipt, setPaymentReceipt] = useState<any | null>(null);
  const [showUtrInput, setShowUtrInput] = useState<boolean>(false);
  const [customUtr, setCustomUtr] = useState<string>("");
  const [renewalRequestedContracts, setRenewalRequestedContracts] = useState<Record<string, boolean>>({});
  const [requestingRenewalCode, setRequestingRenewalCode] = useState<string | null>(null);

  // Active dashboard tab for full client-dashboard embed
  const [dashboardTab, setDashboardTab] = useState<"billing" | "fleet" | "domains" | "support">("billing");

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize communication for parent iframes & web components
  useEffect(() => {
    function notifyParentResize() {
      if (typeof window !== "undefined" && window.parent && containerRef.current) {
        const rectHeight = Math.ceil(containerRef.current.getBoundingClientRect().height);
        const scrollHeight = Math.ceil(containerRef.current.scrollHeight);
        const height = Math.max(rectHeight, scrollHeight);
        window.parent.postMessage({ type: "rsl-embed-resize", height, widget }, "*");
      }
    }
    notifyParentResize();
    const ro = new ResizeObserver(notifyParentResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [widget, invoices, payments, processes, domains, tickets, credentials, releases, activeModal, dashboardTab, invoiceFilter, invoiceSearch, showUtrInput, renewalRequestedContracts]);

  // Cooldown countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldowns((prev) => {
        const updated: Record<string, number> = {};
        let changed = false;
        for (const [id, count] of Object.entries(prev)) {
          if (count > 1) {
            updated[id] = count - 1;
            changed = true;
          } else {
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const triggerAlert = (type: "success" | "error", message: string) => {
    setBannerAlert({ type, message });
    setTimeout(() => setBannerAlert(null), 4000);
  };

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Open Support Ticket Pre-filled with Configuration Instructions
  const openSetupTicket = (
    serviceTitle: string,
    defaultMessage: string,
    category: string = "question"
  ) => {
    setNewTicketForm({
      subject: `[Configuration Request] ${serviceTitle}`,
      priority: "P2",
      category,
      message: defaultMessage,
    });
    setActiveModal("new-ticket");
  };

  // Unified Embed Action Runner (supports both emb_... token and rsl_live_... apiKey)
  const runAction = async (action: string, payload: Record<string, any> = {}) => {
    if (action === "pay-invoice") {
      const invoiceId = payload.invoiceId;
      try {
        setPaymentProcessing(true);
        const res = await fetch("/api/v1/embed-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            apiKey: token?.startsWith("rsl_") ? token : undefined,
            widget,
            clientId,
            action: "pay-invoice",
            payload: {
              invoiceId,
              method: payload.method || paymentMethod || "upi",
              reference: payload.reference || `TXN-${Date.now().toString(36).toUpperCase()}`,
              notes: payload.notes,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Payment processing failed");

        // Update local state in-place
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, ...(data.invoice || {}), status: "paid", balanceMinor: 0 }
              : inv
          )
        );
        if (data.payment) {
          setPayments((prev) => [data.payment, ...prev]);
          setSummary((prev) => ({
            ...prev,
            outstandingMinor: Math.max(0, prev.outstandingMinor - data.payment.amountMinor),
            totalPaidMinor: prev.totalPaidMinor + data.payment.amountMinor,
            unpaidCount: Math.max(0, prev.unpaidCount - 1),
          }));
        }

        // Update currently selected invoice if details are viewed
        setSelectedInvoice((prev: any) =>
          prev && prev.id === invoiceId
            ? { ...prev, ...(data.invoice || {}), status: "paid", balanceMinor: 0 }
            : prev
        );

        setPaymentReceipt({
          payment: data.payment,
          invoice: data.invoice,
        });
        setShowUtrInput(false);
        setCustomUtr("");

        triggerAlert("success", `Invoice ${data.invoice?.invoiceNumber || invoiceId} settled in-place.`);
        return data;
      } catch (err: any) {
        triggerAlert("error", err.message || "Failed to process payment");
      } finally {
        setPaymentProcessing(false);
      }
      return;
    }

    if (action === "request-contract-renewal") {
      const codeKey = payload.contractCode || "primary";
      try {
        setRequestingRenewalCode(codeKey);
        const res = await fetch("/api/v1/embed-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            apiKey: token?.startsWith("rsl_") ? token : undefined,
            widget,
            clientId,
            action: "request-contract-renewal",
            payload,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to submit renewal request");

        if (data.ticket) {
          setTickets((prev) => [data.ticket, ...prev]);
        }
        setRenewalRequestedContracts((prev) => ({ ...prev, [codeKey]: true }));
        triggerAlert("success", "Renewal Request Sent to Commercial Desk");
        return data;
      } catch (err: any) {
        triggerAlert("error", err.message || "Failed to submit renewal request");
      } finally {
        setRequestingRenewalCode(null);
      }
      return;
    }
  };

  // 1. IN-PLACE ACTION: Pay Invoice
  const handlePayInvoice = async (invoiceId: string) => {
    await runAction("pay-invoice", {
      invoiceId,
      method: paymentMethod,
      reference: customUtr.trim() || undefined,
    });
  };

  // 2. IN-PLACE ACTION: Restart Process
  const handleRestartProcess = async (processId: string, processName: string) => {
    if (cooldowns[processId] > 0) return;
    try {
      setRestartingId(processId);
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "restart-process",
          payload: { processId },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restart command failed");

      setCooldowns((prev) => ({ ...prev, [processId]: 60 }));
      setProcesses((prev) =>
        prev.map((p) =>
          p.id === processId
            ? { ...p, status: "online", restarts: (p.restarts || 0) + 1, lastRestartAt: Date.now() }
            : p
        )
      );

      triggerAlert("success", `Service "${processName}" restarted successfully.`);
    } catch (err: any) {
      triggerAlert("error", err.message || "Failed to restart application");
    } finally {
      setRestartingId(null);
    }
  };

  // 3. IN-PLACE ACTION: View Process Logs
  const handleViewLogs = async (proc: any) => {
    setSelectedProcess(proc);
    setActiveModal("logs");
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "get-process-logs",
          payload: { processId: proc.id, lines: 75 },
        }),
      });
      const data = await res.json();
      if (res.ok && data.logs) {
        setLogContent(
          typeof data.logs === "string"
            ? data.logs
            : Array.isArray(data.logs)
            ? data.logs.join("\n")
            : JSON.stringify(data.logs, null, 2)
        );
      } else {
        setLogContent(data.error || `[tail -n 75 ${proc.name}] Process healthy. No uncaught errors in stderr.`);
      }
    } catch {
      setLogContent(`[tail -n 75 ${proc.name}] PM2 daemon output stream connected.`);
    } finally {
      setLoadingLogs(false);
    }
  };

  // 4. IN-PLACE ACTION: Check Domain
  const handleCheckDomain = async (domainId?: string, hostname?: string) => {
    try {
      const activeId = domainId || domains[0]?.id || domains[0]?.props?.id;
      const activeHost = hostname || domains[0]?.hostname || domains[0]?.props?.hostname || "domain";
      if (!activeId) {
        triggerAlert("error", "No monitored domain registered to check");
        return;
      }
      setCheckingDomainId(activeId);
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "check-domain",
          payload: { domainId: activeId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");

      if (data.domain) {
        const normalized = normalizeEntity(data.domain);
        setDomains((prev) =>
          prev.map((d) => {
            const currentId = d.id || d.props?.id;
            return currentId === activeId ? normalized : d;
          })
        );
      }
      triggerAlert("success", `Live check for ${activeHost} completed.`);
    } catch (err: any) {
      triggerAlert("error", err.message || "Failed to run domain health check");
    } finally {
      setCheckingDomainId(null);
    }
  };

  // 5. IN-PLACE ACTION: Create Ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketForm.subject.trim() || !newTicketForm.message.trim()) return;
    try {
      setSubmittingTicket(true);
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "create-ticket",
          payload: newTicketForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ticket");

      setTickets((prev) => [data.ticket, ...prev]);
      setNewTicketForm({ subject: "", priority: "P2", category: "question", message: "" });
      setActiveModal(null);
      triggerAlert("success", `Support Ticket #${data.ticket.number || data.ticket.id} raised.`);
    } catch (err: any) {
      triggerAlert("error", err.message || "Failed to raise support ticket");
    } finally {
      setSubmittingTicket(false);
    }
  };

  // 6. IN-PLACE ACTION: Reply to Ticket
  const handleReplyTicket = async (ticketId: string) => {
    if (!ticketReplyText.trim()) return;
    try {
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "reply-ticket",
          payload: { ticketId, message: ticketReplyText.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post message");

      if (selectedTicket) {
        const msgs = selectedTicket.messages || [];
        setSelectedTicket({
          ...selectedTicket,
          messages: [...msgs, data.message],
        });
      }
      setTicketReplyText("");
      triggerAlert("success", "Reply sent to engineering desk.");
    } catch (err: any) {
      triggerAlert("error", err.message || "Failed to post message");
    }
  };

  // 7. IN-PLACE ACTION: Reveal Credential
  const handleRevealCredential = async (credId: string) => {
    try {
      if (revealedPasswords[credId]) {
        setRevealedPasswords((prev) => {
          const next = { ...prev };
          delete next[credId];
          return next;
        });
        return;
      }
      const res = await fetch("/api/v1/embed-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          widget,
          clientId,
          action: "reveal-credential",
          payload: { credentialId: credId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reveal secret");

      const plain = data.revealed?.secretValue || data.revealed?.plaintext || "Secret-Decrypted";
      setRevealedPasswords((prev) => ({ ...prev, [credId]: plain }));

      // Auto mask after 30s
      setTimeout(() => {
        setRevealedPasswords((prev) => {
          const next = { ...prev };
          delete next[credId];
          return next;
        });
      }, 30000);
    } catch (err: any) {
      triggerAlert("error", err.message || "Failed to reveal credential");
    }
  };

  // Unified Typography & Theme Classes - High-Contrast & Beautiful in Both Modes
  const cardBgClass = isDark
    ? "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-lg"
    : "bg-white border-zinc-200 text-zinc-900 shadow-md";
  const headerBorderClass = isDark ? "border-zinc-800/80" : "border-zinc-200";
  const itemBgClass = isDark
    ? "bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600/70 text-zinc-200"
    : "bg-zinc-50 border-zinc-200/80 hover:border-zinc-300 text-zinc-800";
  const subtleTextClass = isDark ? "text-zinc-400 font-sans" : "text-zinc-500 font-sans";
  const headingTextClass = isDark ? "text-zinc-100 font-steel tracking-tight" : "text-zinc-900 font-steel tracking-tight";
  const secondaryTextClass = isDark ? "text-zinc-300 font-sans" : "text-zinc-700 font-sans";
  const inputBgClass = isDark
    ? "bg-zinc-800/80 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
    : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const buttonSecondaryClass = isDark
    ? "border-zinc-700/70 hover:bg-zinc-800 text-zinc-300 hover:text-white"
    : "border-zinc-200 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900";
  const modalBackdropClass = "fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4";

  // Widget Category Type Flags
  const isInvoiceWidget =
    widget === "invoice-history" ||
    widget === "invoice-list" ||
    widget === "invoice-detail" ||
    widget.includes("invoice");
  const isPaymentWidget =
    widget === "payment-history" ||
    widget.includes("payment");
  const isBillingSummaryWidget =
    widget === "billing-summary" ||
    widget === "due-banner" ||
    widget === "next-due-countdown" ||
    widget === "contract-card" ||
    widget.includes("billing") ||
    widget.includes("due") ||
    widget.includes("contract");
  const isFleetWidget =
    widget === "server-status" ||
    widget === "process-list" ||
    widget === "process-card" ||
    widget === "metrics-chart" ||
    widget.includes("server") ||
    widget.includes("process") ||
    widget.includes("metric") ||
    widget.includes("fleet");
  const isDomainWidget =
    widget === "domain-status" ||
    widget === "uptime-badge" ||
    widget === "ssl-expiry" ||
    widget === "status-page" ||
    widget.includes("domain") ||
    widget.includes("uptime") ||
    widget.includes("ssl") ||
    widget.includes("status-page");
  const isTicketWidget =
    widget === "ticket-desk" ||
    widget === "ticket-widget" ||
    widget === "ticket-list" ||
    widget === "ticket-thread" ||
    widget.includes("ticket") ||
    widget.includes("support");
  const isVaultWidget =
    widget === "vault-secret" ||
    widget.includes("vault") ||
    widget.includes("credential");
  const isReleaseWidget =
    widget === "releases-list" ||
    widget === "release-list" ||
    widget.includes("release");
  const isAnalyticsWidget =
    widget === "analytics-overview" ||
    widget === "analytics-chart" ||
    widget === "pageview-chart" ||
    widget === "traffic-chart" ||
    widget === "visitor-journeys" ||
    widget === "top-pages" ||
    widget === "web-vitals" ||
    widget.includes("analytics") ||
    widget.includes("pageview") ||
    widget.includes("vital") ||
    widget.includes("visitor") ||
    widget.includes("top-page");
  const isExplicitDashboard = widget === "client-dashboard";
  const isUnmatchedWidget =
    !isInvoiceWidget &&
    !isPaymentWidget &&
    !isBillingSummaryWidget &&
    !isFleetWidget &&
    !isDomainWidget &&
    !isTicketWidget &&
    !isVaultWidget &&
    !isReleaseWidget &&
    !isAnalyticsWidget &&
    !isExplicitDashboard;
  const isDashboardWidget = isExplicitDashboard || isUnmatchedWidget;

  // Configuration check helpers
  const isBillingConfigured =
    invoices.length > 0 || summary.totalBilledMinor > 0 || contracts.length > 0;
  const isFleetConfigured = processes.length > 0;
  const isDomainConfigured = domains.length > 0;
  const isVaultConfigured = credentials.length > 0;
  const isReleasesConfigured = releases.length > 0;
  const isAnalyticsConfigured = (analytics.pageviews || 0) > 0;

  // Invoice calculations
  const unpaidInvoices = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "cancelled" && i.status !== "void" && i.status !== "draft"
  );
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const unpaidCount = unpaidInvoices.length;
  const paidCount = paidInvoices.length;

  // Filtered invoices with search (Deterministic date match)
  const filteredInvoices = invoices.filter((inv) => {
    if (invoiceFilter === "unpaid" && inv.status === "paid") return false;
    if (invoiceFilter === "paid" && inv.status !== "paid") return false;
    if (invoiceSearch.trim()) {
      const q = invoiceSearch.toLowerCase().trim();
      const numMatch = inv.invoiceNumber?.toLowerCase().includes(q);
      const notesMatch = inv.notes?.toLowerCase().includes(q);
      const dateMatch = inv.dueDate && formatDate(inv.dueDate).toLowerCase().includes(q);
      if (!numMatch && !notesMatch && !dateMatch) return false;
    }
    return true;
  });

  // Root is strictly the Card itself — no outer min-h-screen wrapper div
  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={`w-full p-5 sm:p-6 rounded-2xl border font-sans ${cardBgClass} ${
        activeModal ? "min-h-[440px]" : ""
      } relative overflow-hidden transition-all duration-200`}
    >
      {/* Subtle Category Gradient Top Line */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r"
        style={{
          backgroundImage: `linear-gradient(to right, ${accent}, #3b82f6)`,
        }}
      />

      {/* Global Alert Notification Banner */}
      {bannerAlert && (
        <div
          className={`mb-4 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
            bannerAlert.type === "success"
              ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
              : "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30"
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerAlert.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerAlert.message}</span>
          </div>
          <button
            onClick={() => setBannerAlert(null)}
            className="text-zinc-400 hover:text-zinc-200 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center justify-between pb-3.5 mb-4 border-b ${headerBorderClass}`}>
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse shadow-xs shrink-0"
            style={{ backgroundColor: accent }}
          />
          <div>
            <h2 className={`text-base font-extrabold tracking-tight capitalize leading-tight font-steel ${headingTextClass}`}>
              {widgetTitle}
            </h2>
            <span className={`text-[11px] font-medium font-sans ${subtleTextClass}`}>
              {clientName} &bull; Live Action
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider font-tech ${
              isDark
                ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
                : "bg-zinc-100 text-zinc-600 border border-zinc-200"
            }`}
          >
            RapidShift
          </span>
        </div>
      </div>

      {/* All-in-One Dashboard Tab Switcher */}
      {isDashboardWidget && (
        <div
          className={`flex items-center gap-1.5 p-1 rounded-xl mb-4 text-xs font-semibold ${
            isDark ? "bg-zinc-800/40 border border-zinc-700/60" : "bg-zinc-100 border border-zinc-200"
          }`}
        >
          {(["billing", "fleet", "domains", "support"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDashboardTab(tab)}
              className={`flex-1 py-1.5 rounded-lg capitalize transition cursor-pointer font-steel tracking-wide ${
                dashboardTab === tab
                  ? "bg-blue-600 text-white shadow-xs font-bold"
                  : isDark
                  ? "text-zinc-400 hover:text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: BILLING SUMMARY, DUE BANNER, COUNTDOWN & CONTRACT CARD         */}
      {/* ========================================================================= */}
      {(isBillingSummaryWidget || (isDashboardWidget && dashboardTab === "billing")) && (
        <div className="space-y-3">
          {!isBillingConfigured ? (
            <NotConfiguredCard
              icon={CreditCard}
              badgeText="RETAINER NOT CONFIGURED"
              title="No Active Billing Agreement or Retainer"
              description="There is currently no active service agreement or billing contract registered for this client account in the control panel."
              benefits={[
                "Live Outstanding Balance Tracking",
                "Automated GST Tax Invoicing",
                "Instant In-Place Settlements",
                "Official Audit & PDF Receipts",
              ]}
              steps={[
                {
                  step: 1,
                  title: "Align on Retainer Scope",
                  description:
                    "Confirm contract tenure (e.g. 12 months) and billing cycle (Monthly/Quarterly/Annual) with your account executive.",
                },
                {
                  step: 2,
                  title: "Submit GST & Entity Particulars",
                  description:
                    "Provide official company name, GSTIN (if registered for input tax credit), and billing email contact.",
                },
                {
                  step: 3,
                  title: "Contract Activation",
                  description:
                    "RapidShift finance desk will activate the contract and publish your scheduled billing anchor dates.",
                },
              ]}
              actionText="Request Retainer & Invoicing Setup"
              onAction={() =>
                openSetupTicket(
                  "Billing Retainer & Contract Setup",
                  `Hi RapidShift Billing Desk,\n\nPlease help us configure our service retainer contract and billing particulars.\n\nCompany Billing Information:\n- Entity Name: ${clientName}\n- GSTIN (if applicable): \n- Billing Contact Email: \n- Preferred Cycle: Monthly`,
                  "billing"
                )
              }
              isDark={isDark}
              accent={accent}
            />
          ) : widget === "contract-card" ? (
            /* DEDICATED VIEW: CONTRACT CARD */
            <div className="space-y-2.5">
              {contracts.length === 0 ? (
                <div className={`p-4 rounded-xl border ${itemBgClass} text-xs text-center ${subtleTextClass}`}>
                  No active contracts registered for {clientName}. ({invoices.length} standalone invoice(s) on file).
                </div>
              ) : (
                contracts.map((activeContract: any) => {
                  const isActive = activeContract.status === "active";
                  const tenure = calculateContractTenure({
                    billingCycle: activeContract.billingCycle || "monthly",
                    intervalCount: activeContract.intervalCount || 1,
                    anchorDay: activeContract.anchorDay || 1,
                    validFrom: activeContract.validFrom,
                    validTo: activeContract.validTo,
                    amountMinor: activeContract.amountMinor || 0,
                    currency: activeContract.currency || "INR",
                    status: activeContract.status,
                  });
                  const contractCodeKey = activeContract.code || "primary";
                  const isRenewalSent = Boolean(renewalRequestedContracts[contractCodeKey]);
                  const isRequestingRenewal = requestingRenewalCode === contractCodeKey;

                  return (
                    <div key={activeContract.id} className={`p-4 rounded-xl border ${itemBgClass} space-y-3 text-xs`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-steel font-bold text-sm ${headingTextClass}`}>
                              {activeContract.title}
                            </span>
                            <span className={`font-mono text-[10px] ${subtleTextClass}`}>
                              ({activeContract.code})
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600/15 text-blue-500 border border-blue-500/30">
                              {tenure.tenureLabel}
                            </span>
                          </div>
                          <p className={`text-[11px] mt-0.5 ${subtleTextClass}`} suppressHydrationWarning>
                            Agreement Period: {tenure.dateRangeLabel} &bull; {tenure.remainingLabel}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-tech shrink-0 ${
                            isActive
                              ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                          }`}
                        >
                          {activeContract.status}
                        </span>
                      </div>

                      {!tenure.isOneTime && (
                        <div className="space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-zinc-500/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all"
                              style={{ width: `${tenure.progressPct}%` }}
                            />
                          </div>
                          <div className={`flex justify-between text-[10px] font-mono ${subtleTextClass}`}>
                            <span>{tenure.elapsedDays}d elapsed ({tenure.progressPct}%)</span>
                            <span>Next Billing: {tenure.nextBillingDateLabel}</span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className={`p-2.5 rounded-lg border ${isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-zinc-200"}`}>
                          <div className={`text-[10px] uppercase font-bold ${subtleTextClass}`}>
                            {tenure.isOneTime ? "One-Time Fee" : "Cycle Retainer"}
                          </div>
                          <div className={`font-mono font-bold text-xs mt-0.5 ${headingTextClass}`}>
                            ₹{formatMinorToINR(activeContract.amountMinor)}
                          </div>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-zinc-200"}`}>
                          <div className={`text-[10px] uppercase font-bold ${subtleTextClass}`}>Total Value (TCV)</div>
                          <div className="font-mono font-bold text-xs mt-0.5 text-emerald-500">
                            ₹{formatMinorToINR(tenure.totalContractValueMinor)}
                          </div>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-zinc-200"}`}>
                          <div className={`text-[10px] uppercase font-bold ${subtleTextClass}`}>Engagement</div>
                          <div className={`font-mono font-bold text-xs uppercase mt-0.5 ${headingTextClass}`}>
                            {tenure.isOneTime
                              ? "One-Time"
                              : `${getBillingCycleLabel(activeContract.billingCycle, activeContract.intervalCount)}`}
                          </div>
                        </div>
                      </div>

                      {/* Self-Service Contract Tenure Renewal Bar */}
                      <div className={`pt-2 border-t ${headerBorderClass} flex flex-wrap items-center justify-between gap-2`}>
                        <span className={`text-[11px] ${subtleTextClass}`}>
                          {!tenure.isOneTime
                            ? `Auto-anchors ${tenure.nextBillingDateLabel}`
                            : "Extend scope or convert to recurring retainer"}
                        </span>
                        {isRenewalSent ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[11px] font-bold inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Renewal Request Sent to Commercial Desk</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isRequestingRenewal}
                            onClick={() =>
                              runAction("request-contract-renewal", {
                                contractCode: activeContract.code,
                                requestedTenure: tenure.tenureLabel,
                              })
                            }
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold font-steel shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
                          >
                            {isRequestingRenewal ? (
                              <IosSpinner size="xs" className="text-white" />
                            ) : (
                              <Calendar className="w-3.5 h-3.5" />
                            )}
                            <span>Request Tenure Renewal</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : widget === "next-due-countdown" ? (
            /* DEDICATED VIEW: NEXT DUE COUNTDOWN */
            (() => {
              const targetInvoice = unpaidInvoices[0];
              const dueMs = targetInvoice?.dueDate ? new Date(targetInvoice.dueDate).getTime() : null;
              const diffDays = dueMs ? Math.ceil((dueMs - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const isOverdue = diffDays !== null && diffDays < 0;
              const activeContract = contracts[0];
              const tenure = activeContract
                ? calculateContractTenure({
                    billingCycle: activeContract.billingCycle || "monthly",
                    intervalCount: activeContract.intervalCount || 1,
                    anchorDay: activeContract.anchorDay || 1,
                    validFrom: activeContract.validFrom,
                    validTo: activeContract.validTo,
                    amountMinor: activeContract.amountMinor || 0,
                    currency: activeContract.currency || "INR",
                    status: activeContract.status,
                  })
                : null;
              const contractCodeKey = activeContract?.code || "primary";
              const isRenewalSent = Boolean(renewalRequestedContracts[contractCodeKey]);
              const isRequestingRenewal = requestingRenewalCode === contractCodeKey;

              return (
                <div className="space-y-3">
                  <div
                    className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      targetInvoice
                        ? isOverdue
                          ? "bg-rose-500/10 border-rose-500/30"
                          : "bg-amber-500/10 border-amber-500/30"
                        : "bg-emerald-500/10 border-emerald-500/30"
                    }`}
                  >
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>
                        {targetInvoice
                          ? `Invoice ${targetInvoice.invoiceNumber} Due Date`
                          : tenure && !tenure.isOneTime
                          ? `Next Scheduled Billing (${tenure.shortTenureLabel} Tenure)`
                          : "Account Settlement Status"}
                      </span>
                      <div
                        className={`text-2xl font-black font-steel tracking-tight mt-0.5 ${
                          targetInvoice
                            ? isOverdue
                              ? "text-rose-500"
                              : "text-amber-500"
                            : "text-emerald-500"
                        }`}
                        suppressHydrationWarning
                      >
                        {targetInvoice
                          ? diffDays === 0
                            ? "Due Today"
                            : isOverdue
                            ? `${Math.abs(diffDays!)} Days Overdue`
                            : `Due in ${diffDays} Days`
                          : tenure && !tenure.isOneTime
                          ? tenure.nextBillingDateLabel
                          : "No Pending Dues"}
                      </div>
                      <p className={`text-[11px] mt-0.5 ${subtleTextClass}`} suppressHydrationWarning>
                        {targetInvoice
                          ? `Target Date: ${formatDate(targetInvoice.dueDate)} • Balance: ₹${formatMinorToINR(
                              targetInvoice.balanceMinor ?? targetInvoice.totalMinor
                            )}`
                          : tenure && activeContract
                          ? `${activeContract.title} • ${tenure.tenureLabel} (${tenure.remainingLabel})`
                          : `${paidCount} settled invoice(s) on record`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {targetInvoice && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(targetInvoice);
                            setActiveModal("pay");
                          }}
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-steel shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Settle Now</span>
                        </button>
                      )}
                      {activeContract && tenure && (!tenure.isOneTime || activeContract) && (
                        isRenewalSent ? (
                          <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[11px] font-bold inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Renewal Request Sent to Commercial Desk</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isRequestingRenewal}
                            onClick={() =>
                              runAction("request-contract-renewal", {
                                contractCode: activeContract.code,
                                requestedTenure: tenure.tenureLabel,
                              })
                            }
                            className={`px-3 py-2 rounded-xl border text-xs font-bold font-steel transition cursor-pointer inline-flex items-center gap-1.5 ${buttonSecondaryClass}`}
                          >
                            {isRequestingRenewal ? (
                              <IosSpinner size="xs" className="text-current" />
                            ) : (
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            )}
                            <span>Request Tenure Renewal</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : widget === "due-banner" ? (
            /* DEDICATED VIEW: COMPACT DUE BANNER */
            (() => {
              const unpaidInvoice = unpaidInvoices[0];
              return summary.outstandingMinor > 0 ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border border-rose-500/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className={`text-sm font-extrabold font-steel ${headingTextClass}`}>
                          Outstanding Balance: ₹{formatMinorToINR(summary.outstandingMinor)}
                        </div>
                        <p className={`text-[11px] ${subtleTextClass}`} suppressHydrationWarning>
                          {unpaidCount} unpaid invoice{unpaidCount === 1 ? "" : "s"}
                          {unpaidInvoice?.dueDate ? ` • Earliest Due: ${formatDate(unpaidInvoice.dueDate)}` : ""}
                        </p>
                      </div>
                    </div>
                    {unpaidInvoice && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={paymentProcessing}
                          onClick={() =>
                            runAction("pay-invoice", {
                              invoiceId: unpaidInvoice.id,
                              method: "upi",
                              reference: customUtr.trim() || undefined,
                            })
                          }
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold font-steel shadow-md transition cursor-pointer flex items-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>
                            Quick Settle (₹{formatMinorToINR(unpaidInvoice.balanceMinor ?? unpaidInvoice.totalMinor)})
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowUtrInput((prev) => !prev)}
                          className={`px-2.5 py-2 rounded-xl border text-[11px] font-semibold transition cursor-pointer ${buttonSecondaryClass}`}
                        >
                          {showUtrInput ? "Hide UTR" : "UTR / Ref #"}
                        </button>
                      </div>
                    )}
                  </div>

                  {unpaidInvoice && showUtrInput && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-rose-500/20">
                      <input
                        type="text"
                        placeholder="Enter UTR / Payment Reference # (e.g. HDFC26101699201)..."
                        value={customUtr}
                        onChange={(e) => setCustomUtr(e.target.value)}
                        className={`flex-1 px-3 py-1.5 rounded-xl border text-xs font-mono transition ${inputBgClass}`}
                      />
                      <button
                        type="button"
                        disabled={paymentProcessing}
                        onClick={() =>
                          runAction("pay-invoice", {
                            invoiceId: unpaidInvoice.id,
                            method: "bank_transfer",
                            reference: customUtr.trim() || undefined,
                          })
                        }
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold font-steel shadow-xs transition cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {paymentProcessing ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Submit UTR</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <div className={`text-sm font-extrabold font-steel ${headingTextClass}`}>
                        All Invoices Settled &bull; ₹0 Due
                      </div>
                      <p className={`text-[11px] ${subtleTextClass}`}>
                        {contracts[0]
                          ? (() => {
                              const t = calculateContractTenure(contracts[0]);
                              return `Contract Tenure: ${t.tenureLabel} • Next Billing: ${t.nextBillingDateLabel}`;
                            })()
                          : `Total Paid: ₹${formatMinorToINR(summary.totalPaidMinor)} across ${paidCount} invoice${paidCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider font-tech">
                    Active
                  </span>
                </div>
              );
            })()
          ) : (
            /* DEFAULT BILLING SUMMARY & DASHBOARD BILLING TAB */
            (() => {
              const unpaidInvoice = unpaidInvoices[0];
              return (
                <>
                  {summary.outstandingMinor > 0 ? (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/10 via-blue-500/5 to-transparent border border-rose-500/20 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className={`text-[11px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>Current Balance Due</span>
                          <div className="text-2xl sm:text-3xl font-black font-steel tracking-tight text-rose-500 mt-0.5 tabular-nums">
                            ₹{formatMinorToINR(summary.outstandingMinor)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider font-tech">
                            {summary.overdueMinor > 0 ? "Overdue" : `${unpaidCount} Due`}
                          </span>
                          {unpaidInvoice && (
                            <>
                              <button
                                type="button"
                                disabled={paymentProcessing}
                                onClick={() =>
                                  runAction("pay-invoice", {
                                    invoiceId: unpaidInvoice.id,
                                    method: "upi",
                                    reference: customUtr.trim() || undefined,
                                  })
                                }
                                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold font-steel shadow-md transition cursor-pointer flex items-center gap-1.5"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Quick Settle</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowUtrInput((prev) => !prev)}
                                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition cursor-pointer ${buttonSecondaryClass}`}
                              >
                                {showUtrInput ? "Hide UTR" : "UTR / Ref #"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {unpaidInvoice && showUtrInput && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-rose-500/20">
                          <input
                            type="text"
                            placeholder="Enter UTR / Payment Reference # (e.g. NEFT/UTR-994810)..."
                            value={customUtr}
                            onChange={(e) => setCustomUtr(e.target.value)}
                            className={`flex-1 px-3 py-1.5 rounded-xl border text-xs font-mono transition ${inputBgClass}`}
                          />
                          <button
                            type="button"
                            disabled={paymentProcessing}
                            onClick={() =>
                              runAction("pay-invoice", {
                                invoiceId: unpaidInvoice.id,
                                method: "bank_transfer",
                                reference: customUtr.trim() || undefined,
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold font-steel shadow-xs transition cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
                          >
                            {paymentProcessing ? (
                              <IosSpinner size="xs" className="text-white" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Submit UTR Settlement</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-blue-500/5 to-transparent border border-emerald-500/20 flex items-center justify-between">
                      <div>
                        <span className={`text-[11px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>Current Balance Due</span>
                        <div className="text-xl sm:text-2xl font-black font-steel tracking-tight text-emerald-500 mt-0.5 flex items-center gap-1.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <span>Paid in Full</span>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider font-tech">
                        Settled
                      </span>
                    </div>
                  )}

                  {/* Real 3-Column Financial Ledger Totals */}
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                    <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Total Billed</p>
                      <p className={`font-tech font-bold text-xs mt-0.5 tracking-tight tabular-nums ${headingTextClass}`}>
                        ₹{formatMinorToINR(summary.totalBilledMinor)}
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Total Paid</p>
                      <p className="font-tech font-bold text-xs text-emerald-500 mt-0.5 tracking-tight tabular-nums">
                        ₹{formatMinorToINR(summary.totalPaidMinor)}
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Overdue</p>
                      <p className={`font-tech font-bold text-xs mt-0.5 tracking-tight tabular-nums ${summary.overdueMinor > 0 ? "text-rose-500" : headingTextClass}`}>
                        ₹{formatMinorToINR(summary.overdueMinor)}
                      </p>
                    </div>
                  </div>

                  {/* Real Contract Details Row with Calculated Tenure (if contract exists) */}
                  {contracts[0] &&
                    (() => {
                      const activeContract = contracts[0];
                      const tenure = calculateContractTenure({
                        billingCycle: activeContract.billingCycle || "monthly",
                        intervalCount: activeContract.intervalCount || 1,
                        anchorDay: activeContract.anchorDay || 1,
                        validFrom: activeContract.validFrom,
                        validTo: activeContract.validTo,
                        amountMinor: activeContract.amountMinor || 0,
                        currency: activeContract.currency || "INR",
                        status: activeContract.status,
                      });
                      const contractCodeKey = activeContract.code || "primary";
                      const isRenewalSent = Boolean(renewalRequestedContracts[contractCodeKey]);
                      const isRequestingRenewal = requestingRenewalCode === contractCodeKey;

                      return (
                        <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2 text-xs`}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-semibold ${headingTextClass}`}>{activeContract.title}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600/15 text-blue-500 border border-blue-500/30">
                                  {tenure.tenureLabel}
                                </span>
                              </div>
                              <p className={`text-[10px] mt-0.5 ${subtleTextClass}`} suppressHydrationWarning>
                                {tenure.dateRangeLabel} &bull;{" "}
                                {tenure.isOneTime
                                  ? "One-Time Engagement"
                                  : `Next Billing: ${tenure.nextBillingDateLabel} (${tenure.remainingLabel})`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isRenewalSent ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span>Renewal Request Sent to Commercial Desk</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRequestingRenewal}
                                  onClick={() =>
                                    runAction("request-contract-renewal", {
                                      contractCode: activeContract.code,
                                      requestedTenure: tenure.tenureLabel,
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold font-steel transition cursor-pointer inline-flex items-center gap-1 ${buttonSecondaryClass}`}
                                >
                                  <Calendar className="w-3 h-3 text-blue-500" />
                                  <span>Request Tenure Renewal</span>
                                </button>
                              )}
                              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 text-[10px] font-bold font-tech uppercase tracking-wider shrink-0">
                                {activeContract.status}
                              </span>
                            </div>
                          </div>
                          {!tenure.isOneTime && (
                            <div className="w-full h-1.5 rounded-full bg-zinc-500/20 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all"
                                style={{ width: `${tenure.progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setActiveModal("invoices-modal")}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${buttonSecondaryClass}`}
                    >
                      <span>Invoices ({invoices.length})</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                    <button
                      onClick={() => setActiveModal("payments-modal")}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${buttonSecondaryClass}`}
                    >
                      <span>Payments ({payments.length})</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: INVOICE HISTORY / LIST / DETAIL                                */}
      {/* ========================================================================= */}
      {isInvoiceWidget && !isDashboardWidget && (
          <div className="space-y-3">
            {invoices.length === 0 && summary.totalBilledMinor === 0 ? (
              <NotConfiguredCard
                icon={FileText}
                badgeText="INVOICING INACTIVE"
                title="No Tax Invoices Issued Yet"
                description="No tax invoices or billing cycles have been generated for this client account. Invoices with itemized SAC codes (998311), GST tax calculations, and PDF downloads will appear here as billing periods mature."
                benefits={[
                  "Downloadable Tax Invoices (SAC 998311)",
                  "Itemized Line Item breakdowns",
                  "One-Click In-Place Settlements",
                  "Audit Trail & Payment Verification",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Active Contract Required",
                    description:
                      "Invoices are auto-generated from your active service agreement on each scheduled billing anchor.",
                  },
                  {
                    step: 2,
                    title: "Direct Milestone Invoicing",
                    description:
                      "For custom project milestones or ad-hoc services, your account lead can issue an immediate invoice.",
                  },
                  {
                    step: 3,
                    title: "Live Notifications",
                    description:
                      "You will receive an email notice when a new invoice is posted and ready for settlement.",
                  },
                ]}
                actionText="Contact Billing Desk"
                onAction={() =>
                  openSetupTicket(
                    "Invoice Generation Inquiry",
                    `Hi RapidShift Billing Team,\n\nWe are looking to confirm when our initial tax invoice or service retainer invoice will be issued for ${clientName}. Please advise on current status.`,
                    "billing"
                  )
                }
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <>
                {/* Top KPI Summary Header Card */}
                {summary.outstandingMinor > 0 ? (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/10 via-blue-500/5 to-transparent border border-rose-500/20 flex items-center justify-between">
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>Outstanding Balance</span>
                      <div className="text-2xl sm:text-3xl font-black font-steel tracking-tight text-rose-500 mt-0.5 tabular-nums">
                        ₹{formatMinorToINR(summary.outstandingMinor)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider font-tech">
                        Due
                      </span>
                      {unpaidInvoices[0] && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(unpaidInvoices[0]);
                            setActiveModal("pay");
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-steel shadow-md transition cursor-pointer flex items-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay Now</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-blue-500/5 to-transparent border border-emerald-500/20 flex items-center justify-between">
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>Account Balance</span>
                      <div className="text-xl sm:text-2xl font-black font-steel tracking-tight text-emerald-500 mt-0.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span>Paid in Full</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider font-tech">
                      Settled
                    </span>
                  </div>
                )}

                {/* 3-Metric Summary Grid */}
                <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Total Billed</p>
                    <p className={`font-tech font-bold text-xs mt-0.5 tracking-tight tabular-nums ${headingTextClass}`}>
                      ₹{formatMinorToINR(summary.totalBilledMinor)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Total Settled</p>
                    <p className="font-tech font-bold text-xs text-emerald-500 mt-0.5 tracking-tight tabular-nums">
                      ₹{formatMinorToINR(summary.totalPaidMinor)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>Invoices</p>
                    <p className={`font-tech font-bold text-xs mt-0.5 tracking-tight tabular-nums ${headingTextClass}`}>
                      {invoices.length} Total {unpaidCount > 0 ? `(${unpaidCount} Due)` : ""}
                    </p>
                  </div>
                </div>

                {/* Search Input and Filter Pills */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
                    <div className="relative flex-1">
                      <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${subtleTextClass}`} />
                      <input
                        type="text"
                        placeholder="Search invoices (e.g. INV-2026)..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs transition ${inputBgClass}`}
                      />
                      {invoiceSearch && (
                        <button
                          onClick={() => setInvoiceSearch("")}
                          className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 ${subtleTextClass} hover:${headingTextClass} cursor-pointer`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      {(
                        [
                          { id: "all", label: "All", count: invoices.length },
                          { id: "unpaid", label: "Unpaid", count: unpaidCount },
                          { id: "paid", label: "Paid", count: paidCount },
                        ] as const
                      ).map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => setInvoiceFilter(filter.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 font-steel ${
                            invoiceFilter === filter.id
                              ? "bg-blue-600 text-white shadow-xs"
                              : isDark
                              ? "bg-zinc-800/60 text-zinc-400 hover:text-white border border-zinc-700/50"
                              : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200"
                          }`}
                        >
                          <span>{filter.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-tech font-bold ${
                              invoiceFilter === filter.id
                                ? "bg-white/20 text-white"
                                : isDark
                                ? "bg-zinc-700 text-zinc-300"
                                : "bg-zinc-200 text-zinc-700"
                            }`}
                          >
                            {filter.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Invoice Cards */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredInvoices.length === 0 ? (
                    <div className={`p-6 text-center text-xs ${subtleTextClass} rounded-xl border ${itemBgClass}`}>
                      {invoiceSearch
                        ? `No invoices matching "${invoiceSearch}".`
                        : "No invoices in this filter category."}
                    </div>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isPaid = inv.status === "paid";
                      return (
                        <div
                          key={inv.id}
                          className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs transition duration-150`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-tech font-bold text-xs tracking-tight ${headingTextClass}`}>
                                {inv.invoiceNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-tech ${
                                  isPaid
                                    ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                {inv.status}
                              </span>
                            </div>
                            <div className={`text-[11px] ${subtleTextClass} flex items-center gap-2 flex-wrap font-sans`}>
                              <span suppressHydrationWarning>Due: {formatDate(inv.dueDate)}</span>
                              <span>&bull;</span>
                              <span className="font-tech tabular-nums">Total: ₹{formatMinorToINR(inv.totalMinor)}</span>
                              {!isPaid && inv.balanceMinor !== undefined && (
                                <>
                                  <span>&bull;</span>
                                  <span className="font-tech font-semibold text-rose-500 dark:text-rose-400 tabular-nums">
                                    Bal: ₹{formatMinorToINR(inv.balanceMinor)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isPaid ? (
                              <button
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setActiveModal("pay");
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Pay</span>
                              </button>
                            ) : (
                              <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-semibold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Settled</span>
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setActiveModal("invoice-details");
                              }}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer ${buttonSecondaryClass}`}
                            >
                              Details
                            </button>
                            <a
                              href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className={`p-1.5 rounded-lg border transition ${buttonSecondaryClass}`}
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 3: PAYMENT HISTORY                                                */}
        {/* ========================================================================= */}
        {isPaymentWidget && !isDashboardWidget && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <NotConfiguredCard
                icon={Receipt}
                badgeText="PAYMENT LEDGER EMPTY"
                title="No Payment Records Recorded"
                description={
                  summary.outstandingMinor > 0
                    ? `You currently have ₹${formatMinorToINR(
                        summary.outstandingMinor
                      )} outstanding across ${unpaidCount} invoice(s). Once settled via UPI, Bank Transfer, or Cards, verified receipts will appear here.`
                    : "No payment transactions have been recorded for this account. Once invoices are settled, verified transaction receipts with unique references will appear here automatically."
                }
                benefits={[
                  "Instant Settlement Verification",
                  "Unique Transaction Audit References",
                  "Multi-Payment Mode Records (UPI, NEFT, Card)",
                  "1-Click In-Place Receipt Viewing",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Receive Tax Invoice",
                    description: "Review your issued invoice under the Invoices tab.",
                  },
                  {
                    step: 2,
                    title: "Select Settlement Method",
                    description: "Settle in-place using UPI, IMPS/NEFT Bank Transfer, or Corporate Card.",
                  },
                  {
                    step: 3,
                    title: "Automatic Receipt Generation",
                    description: "Verified receipts are stamped and downloadable immediately upon confirmation.",
                  },
                ]}
                actionText={
                  unpaidInvoices.length > 0 ? "Pay Outstanding Invoice Now" : "Contact Finance Team"
                }
                onAction={() => {
                  if (unpaidInvoices.length > 0) {
                    setSelectedInvoice(unpaidInvoices[0]);
                    setActiveModal("pay");
                  } else {
                    openSetupTicket(
                      "Payment Ledger Inquiry",
                      `Hi Finance Desk,\n\nInquiring about payment records and receipts for ${clientName}.`,
                      "billing"
                    );
                  }
                }}
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className={subtleTextClass}>{payments.length} Verified Transactions</span>
                  <span className="font-mono text-emerald-500 font-bold">
                    Total: ₹{formatMinorToINR(summary.totalPaidMinor)}
                  </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs`}
                    >
                      <div>
                        <span className={`font-mono font-bold ${headingTextClass}`}>
                          {p.reference || p.id}
                        </span>
                        <p className={`text-[11px] ${subtleTextClass}`}>
                          <span suppressHydrationWarning>{formatDate(p.paymentDate)}</span> &bull; Method:{" "}
                          {p.method?.toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-500">
                          ₹{formatMinorToINR(p.amountMinor)}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedPayment(p);
                            setActiveModal("payment-receipt");
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${buttonSecondaryClass}`}
                        >
                          Receipt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 4: SERVER STATUS & PM2 PROCESSES                                  */}
        {/* ========================================================================= */}
        {(isFleetWidget || (isDashboardWidget && dashboardTab === "fleet")) && (
          <div className="space-y-3">
            {!isFleetConfigured ? (
              <NotConfiguredCard
                icon={Server}
                badgeText="FLEET NOT CONFIGURED"
                title="No Server Processes Mapped"
                description="This account does not have any application servers or PM2 process workers linked to the RapidShift control panel."
                benefits={[
                  "Realtime CPU & Memory Telemetry",
                  "In-Place PM2 Service Restarts with Cooldown",
                  "Live Daemon Terminal Log Streaming",
                  "Strict Tenant Isolation & Audited Actions",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Authorize RapidShift SSH Key",
                    description:
                      "Add our control panel public key to ~/.ssh/authorized_keys on your Ubuntu host (user: ubuntu).",
                  },
                  {
                    step: 2,
                    title: "Specify PM2 Applications",
                    description:
                      "List your managed PM2 process names (e.g. web-app, worker, api-server).",
                  },
                  {
                    step: 3,
                    title: "Automated Discovery",
                    description:
                      "RapidShift runs pm2 jlist over secure SSH to map your processes to this live embed.",
                  },
                ]}
                actionText="Request Fleet & PM2 Configuration"
                onAction={() =>
                  openSetupTicket(
                    "PM2 & Server Fleet Configuration",
                    `Hi RapidShift Engineering Team,\n\nPlease help us link our production server and PM2 processes to our control panel.\n\nServer details:\n- Host IP / Domain: \n- SSH Port: 22\n- SSH User: ubuntu\n- Process Names: `,
                    "outage"
                  )
                }
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <>
                {/* Fleet Overview Box */}
                {(() => {
                  const uniqueHosts = Array.from(
                    new Set(
                      processes
                        .map((p) => p.serverName || p.serverHost)
                        .filter(Boolean)
                    )
                  );
                  const hostLabel =
                    uniqueHosts.length === 1
                      ? uniqueHosts[0]
                      : uniqueHosts.length > 1
                      ? `${uniqueHosts.length} Nodes`
                      : `${processes.length} Mapped`;
                  const onlineCount = processes.filter((p) => p.status === "online").length;
                  return (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 flex items-center justify-between text-xs">
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider font-steel ${subtleTextClass}`}>
                          PM2 Managed Fleet
                        </span>
                        <div className="text-base font-extrabold text-blue-500 mt-0.5 flex items-center gap-1.5 font-steel tracking-tight">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              onlineCount === processes.length
                                ? "bg-emerald-500 animate-pulse"
                                : onlineCount > 0
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                          />
                          Active Services ({onlineCount}/{processes.length})
                        </div>
                      </div>
                      <span className="font-tech text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        Host: {hostLabel}
                      </span>
                    </div>
                  );
                })()}

                {/* Process List */}
                <div className="space-y-2">
                  {processes.map((proc) => {
                    const isOnline = proc.status === "online";
                    const cooldown = cooldowns[proc.id] || 0;
                    const cpuVal = proc.cpu ?? proc.cpuPercent;
                    const memBytes = proc.memory ?? proc.memoryBytes;
                    const memLabel =
                      memBytes !== undefined && memBytes !== null && memBytes > 0
                        ? memBytes >= 1024 * 1024
                          ? `${(memBytes / (1024 * 1024)).toFixed(0)}MB`
                          : `${Math.round(memBytes / 1024)}KB`
                        : "0MB";
                    const uptimeLabel = formatUptime(proc.uptimeMs);
                    return (
                      <div
                        key={proc.id}
                        className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs gap-2`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Server className={`w-4 h-4 shrink-0 ${isOnline ? "text-emerald-500" : "text-rose-500"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-steel font-bold text-xs tracking-tight truncate ${headingTextClass}`}>
                                {proc.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider font-tech ${
                                  isOnline
                                    ? "bg-emerald-500/20 text-emerald-500"
                                    : "bg-rose-500/20 text-rose-500"
                                }`}
                              >
                                {proc.status || "unknown"}
                              </span>
                              {proc.pm2Id !== undefined && (
                                <span className={`font-mono text-[10px] ${subtleTextClass}`}>
                                  #{proc.pm2Id}
                                </span>
                              )}
                            </div>
                            <div className="font-tech text-[11px] text-emerald-500 font-semibold tabular-nums flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span>CPU {cpuVal !== undefined && cpuVal !== null ? `${cpuVal}%` : "0%"}</span>
                              <span>&bull;</span>
                              <span>RAM {memLabel}</span>
                              {uptimeLabel && (
                                <>
                                  <span>&bull;</span>
                                  <span className={subtleTextClass}>Up {uptimeLabel}</span>
                                </>
                              )}
                              {typeof proc.restarts === "number" && proc.restarts > 0 && (
                                <>
                                  <span>&bull;</span>
                                  <span className={subtleTextClass}>{proc.restarts} restarts</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {proc.allowClientRestart !== false && (
                            <button
                              onClick={() => handleRestartProcess(proc.id, proc.name)}
                              disabled={restartingId === proc.id || cooldown > 0}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold font-steel text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              {restartingId === proc.id ? (
                                <IosSpinner size="xs" className="text-white" />
                              ) : (
                                <RotateCw className="w-3 h-3" />
                              )}
                              <span>{cooldown > 0 ? `${cooldown}s` : "Restart"}</span>
                            </button>
                          )}
                          {proc.allowClientLogs !== false && (
                            <button
                              onClick={() => handleViewLogs(proc)}
                              className={`px-2.5 py-1 rounded-lg border font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer ${buttonSecondaryClass}`}
                            >
                              <Terminal className="w-3 h-3 text-zinc-400" />
                              <span>Logs</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 5: DOMAIN MONITORING & UPTIME                                     */}
        {/* ========================================================================= */}
        {(isDomainWidget || (isDashboardWidget && dashboardTab === "domains")) && (
          <div className="space-y-3">
            {!isDomainConfigured ? (
              <NotConfiguredCard
                icon={Globe}
                badgeText="MONITORING NOT CONFIGURED"
                title="No Monitored Domains Registered"
                description="Synthetic HTTP uptime monitoring, SSL certificate expiry tracking, and DNS resolution monitoring are not yet active for your domains."
                benefits={[
                  "60-Second Continuous HTTP Probing",
                  "SSL Certificate Expiry Alerts (<30 Days)",
                  "DNS Drift Detection & Propagation Checks",
                  "Public/Private Uptime Status Badges",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Specify Target Hostnames",
                    description:
                      "Submit your public domain names (e.g. app.yourcompany.com, api.yourcompany.com).",
                  },
                  {
                    step: 2,
                    title: "Ensure Health Endpoint Returns 200",
                    description:
                      "Provide a public route (e.g. /api/health or /) that responds with HTTP 200 OK.",
                  },
                  {
                    step: 3,
                    title: "Synthetic Probes Activate",
                    description:
                      "Continuous probes run automatically and trigger SLA escalation if consecutive failures occur.",
                  },
                ]}
                actionText="Register Domain for Monitoring"
                onAction={() =>
                  openSetupTicket(
                    "Domain & SSL Monitoring Setup",
                    `Hi RapidShift Team,\n\nPlease register our domain(s) for 24x7 synthetic uptime and SSL certificate monitoring:\n\n- Primary Domain: \n- Health Endpoint URL: https://.../api/health\n- Target Status Code: 200 OK`,
                    "question"
                  )
                }
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <div className="space-y-3">
                {domains.map((dom, domIdx) => {
                  const domId = dom.id || dom.props?.id || `dom-${domIdx}`;
                  const hostname = dom.hostname || dom.props?.hostname || "Registered Domain";
                  const status = dom.status || dom.props?.status || "unknown";
                  const isUp = status === "up";
                  const isDown = status === "down";
                  const isDegraded = status === "degraded";
                  const httpStatus = dom.lastHttpStatus ?? dom.props?.lastHttpStatus ?? dom.lastStatusCode ?? null;
                  const latencyMs = dom.lastLatencyMs ?? dom.props?.lastLatencyMs ?? null;
                  const sslDays = dom.sslDaysRemaining ?? dom.props?.sslDaysRemaining ?? null;
                  const sslStatus = dom.sslStatus || dom.props?.sslStatus || "unknown";
                  const sslIssuer = dom.sslIssuer ?? dom.props?.sslIssuer ?? null;
                  const dnsStatus = dom.dnsStatus || dom.props?.dnsStatus || "unknown";
                  const resolvedIp = dom.resolvedIp ?? dom.props?.resolvedIp ?? null;
                  const openIncidentsCount = dom.openIncidentsCount ?? 0;
                  const isChecking = checkingDomainId === domId;

                  const statusLabel = isUp
                    ? latencyMs !== null
                      ? `Operational (${latencyMs}ms)`
                      : "Operational"
                    : isDegraded
                    ? "Degraded Performance"
                    : isDown
                    ? "Service Unreachable"
                    : "Pending Probe";

                  const badgeLabel =
                    httpStatus !== null
                      ? isUp
                        ? `HTTP ${httpStatus} OK`
                        : `HTTP ${httpStatus}`
                      : isUp
                      ? "Reachable"
                      : isDown
                      ? "Unreachable"
                      : "Awaiting Check";

                  return (
                    <div key={domId} className="space-y-2.5">
                      {/* Availability Box with real domain telemetry */}
                      <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold font-steel tracking-tight ${headingTextClass}`}>
                              {hostname}
                            </span>
                            {openIncidentsCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-500">
                                {openIncidentsCount} Incident{openIncidentsCount > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-xl sm:text-2xl font-black font-steel tracking-tight mt-0.5 ${
                              isUp ? "text-emerald-500" : isDown ? "text-rose-500" : "text-blue-500"
                            }`}
                          >
                            {statusLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider font-tech ${
                              isUp
                                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                                : isDown
                                ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                                : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                            }`}
                          >
                            {badgeLabel}
                          </span>
                          <button
                            onClick={() => handleCheckDomain(domId, hostname)}
                            disabled={isChecking}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${buttonSecondaryClass}`}
                            title="Run Live Synthetic Probe"
                          >
                            {isChecking ? (
                              <IosSpinner size="xs" className="text-current" />
                            ) : (
                              <RotateCw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Real 3-Column Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                        <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                          <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>
                            HTTP Probe
                          </p>
                          <p
                            className={`font-tech font-extrabold text-sm mt-0.5 tracking-tight tabular-nums ${
                              isUp ? "text-emerald-500" : isDown ? "text-rose-500" : headingTextClass
                            }`}
                          >
                            {httpStatus !== null
                              ? `${httpStatus}${latencyMs !== null ? ` · ${latencyMs}ms` : ""}`
                              : isUp
                              ? "Up"
                              : status.toUpperCase()}
                          </p>
                        </div>
                        <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                          <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>
                            SSL Certificate
                          </p>
                          <p
                            className={`font-tech font-extrabold text-sm mt-0.5 tracking-tight tabular-nums ${
                              sslStatus === "expired" || sslStatus === "invalid"
                                ? "text-rose-500"
                                : sslStatus === "expiring_soon"
                                ? "text-amber-500"
                                : "text-emerald-500"
                            }`}
                            title={sslIssuer ? `Issuer: ${sslIssuer}` : undefined}
                          >
                            {sslDays !== null
                              ? `${sslDays}d left`
                              : sslStatus === "valid"
                              ? "Valid"
                              : sslStatus === "unknown"
                              ? "Unchecked"
                              : sslStatus}
                          </p>
                        </div>
                        <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                          <p className={`text-[10px] uppercase font-bold tracking-wider font-steel ${subtleTextClass}`}>
                            DNS Status
                          </p>
                          <p
                            className={`font-tech font-extrabold text-sm mt-0.5 tracking-tight tabular-nums truncate ${
                              dnsStatus === "drift_detected" || dnsStatus === "resolution_failed"
                                ? "text-rose-500"
                                : "text-emerald-500"
                            }`}
                            title={resolvedIp || undefined}
                          >
                            {dnsStatus === "drift_detected"
                              ? "Drift"
                              : dnsStatus === "resolution_failed"
                              ? "Failed"
                              : resolvedIp
                              ? resolvedIp
                              : dnsStatus === "healthy"
                              ? "Resolved"
                              : "Pending"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 6: SUPPORT DESK                                                   */}
        {/* ========================================================================= */}
        {(isTicketWidget || (isDashboardWidget && dashboardTab === "support")) && (
          <div className="space-y-3">
            {/* Real Support Ticket Metrics Box */}
            {(() => {
              const openCount = tickets.filter(
                (t) => t.status !== "resolved" && t.status !== "closed"
              ).length;
              const resolvedCount = tickets.filter(
                (t) => t.status === "resolved" || t.status === "closed"
              ).length;
              const breachedCount = tickets.filter(
                (t) => t.slaBreached && t.status !== "resolved" && t.status !== "closed"
              ).length;
              return (
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 flex items-center justify-between text-xs">
                  <div>
                    <span className={subtleTextClass}>Support Desk &amp; SLA</span>
                    <div className="text-base font-bold text-blue-500 mt-0.5">
                      {openCount > 0
                        ? `${openCount} Active Ticket${openCount > 1 ? "s" : ""}`
                        : "All Tickets Resolved"}
                    </div>
                  </div>
                  <span
                    className={`font-semibold text-xs px-2.5 py-1 rounded-lg border ${
                      breachedCount > 0
                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    }`}
                  >
                    {breachedCount > 0
                      ? `${breachedCount} SLA Escalated`
                      : `${tickets.length} Total (${resolvedCount} Closed)`}
                  </span>
                </div>
              );
            })()}

            {/* Action Row */}
            <div className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs`}>
              <div>
                <p className={`font-semibold ${headingTextClass}`}>Need Assistance?</p>
                <p className={`text-[11px] mt-0.5 ${subtleTextClass}`}>
                  Open a support ticket with automatic SLA tracking
                </p>
              </div>
              <button
                onClick={() => setActiveModal("new-ticket")}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Ticket</span>
              </button>
            </div>

            {/* Existing Tickets List */}
            {tickets.length > 0 ? (
              <div className="space-y-2 pt-1">
                <span className={`text-[11px] font-bold uppercase ${subtleTextClass}`}>
                  Support Threads ({tickets.length})
                </span>
                {tickets.slice(0, widget === "ticket-list" ? 8 : 4).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTicket(t);
                      setActiveModal("ticket-thread");
                    }}
                    className={`p-3 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs cursor-pointer hover:border-blue-500/50 transition gap-2`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {t.ticketNumber && (
                          <span className={`font-mono text-[10px] ${subtleTextClass}`}>
                            #{t.ticketNumber}
                          </span>
                        )}
                        <span className={`font-semibold truncate ${headingTextClass}`}>{t.subject}</span>
                      </div>
                      <p className={`text-[10px] ${subtleTextClass} mt-0.5`}>
                        Priority: {String(t.priority).toUpperCase()} &bull; Status: {t.status}
                        {t.escalationLevel ? ` • L${t.escalationLevel}` : ""}
                      </p>
                    </div>
                    <span className="text-blue-500 font-bold text-[11px] shrink-0">View Thread &rarr;</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-4 rounded-xl border ${itemBgClass} text-center space-y-1`}>
                <p className={`text-xs font-semibold ${headingTextClass}`}>No Support Tickets Raised</p>
                <p className={`text-[11px] ${subtleTextClass}`}>
                  All systems are running smoothly. If you require technical support or configuration changes, click New Ticket.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 7: VAULT SECRET VIEWER                                            */}
        {/* ========================================================================= */}
        {isVaultWidget && (
          <div className="space-y-3">
            {!isVaultConfigured ? (
              <NotConfiguredCard
                icon={Lock}
                badgeText="VAULT UNPOPULATED"
                title="No Encrypted Secrets Stored"
                description="Your client AES-256-GCM vault is active and secure, but no environment secrets, API tokens, or server credentials have been deposited yet."
                benefits={[
                  "Hardware-Grade AES-256-GCM Encryption at Rest",
                  "Immutable Audit Logging on Every Secret Reveal",
                  "30-Second Automatic Plaintext Masking",
                  "1-Click Secure Clipboard Copy",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Select Sensitive Items",
                    description:
                      "Identify keys (database strings, payment gateways, deploy keys) needing multi-party access.",
                  },
                  {
                    step: 2,
                    title: "Submit Deposit Request",
                    description:
                      "Request credential storage via an audited support ticket or admin provisioning.",
                  },
                  {
                    step: 3,
                    title: "Reveal On-Demand",
                    description:
                      "Access secrets anytime from this embed with verified audit tracking.",
                  },
                ]}
                actionText="Request Vault Secret Provisioning"
                onAction={() =>
                  openSetupTicket(
                    "Vault Secret Deposit Request",
                    `Hi RapidShift Security Desk,\n\nPlease help us store shared credentials in our encrypted vault.\n\nCredential Details:\n- Secret Name: \n- Category (API Key / Database / Service Account / SSH): \n- Environment (Staging / Production): `,
                    "question"
                  )
                }
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <>
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 flex items-center justify-between text-xs">
                  <div>
                    <span className={subtleTextClass}>Encrypted Vault</span>
                    <div className="text-base font-bold text-blue-500 mt-0.5">
                      AES-256-GCM ({credentials.length} Secret{credentials.length > 1 ? "s" : ""})
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    Audited
                  </span>
                </div>

                <div className="space-y-2">
                  {credentials.map((cred) => {
                    const isRevealed = !!revealedPasswords[cred.id];
                    return (
                      <div
                        key={cred.id}
                        className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs`}
                      >
                        <div className="space-y-0.5">
                          <span className={`font-semibold ${headingTextClass}`}>{cred.name}</span>
                          <p className={`font-mono text-[11px] ${subtleTextClass}`}>
                            {cred.username ? `User: ${cred.username}` : `Category: ${cred.category}`}
                          </p>
                          {isRevealed && (
                            <p className="font-mono text-xs text-emerald-500 font-bold pt-1 select-all">
                              {revealedPasswords[cred.id]}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRevealCredential(cred.id)}
                            className={`px-2.5 py-1 rounded-lg border font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer ${buttonSecondaryClass}`}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{isRevealed ? "Hide" : "Reveal"}</span>
                          </button>
                          {isRevealed && (
                            <button
                              onClick={() => copyToClipboard(revealedPasswords[cred.id], cred.id)}
                              className={`p-1 rounded-lg border transition cursor-pointer ${buttonSecondaryClass}`}
                              title="Copy Password"
                            >
                              {copiedId === cred.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 8: RELEASES LIST                                                  */}
        {/* ========================================================================= */}
        {isReleaseWidget && (
          <div className="space-y-3">
            {!isReleasesConfigured ? (
              <NotConfiguredCard
                icon={Rocket}
                badgeText="PIPELINE STANDBY"
                title="No Software Releases Registered"
                description="Deployment release tracking is standby, but no staging or production builds have been registered for this client portal yet."
                benefits={[
                  "Verified Staging & Production URLs",
                  "Semantic Version History & Changelogs",
                  "Git Commit SHA Traceability",
                  "1-Click Direct Launch",
                ]}
                steps={[
                  {
                    step: 1,
                    title: "Connect GitHub / GitLab CI",
                    description:
                      "Link your repository workflow or deployment webhook to the RapidShift release dispatcher.",
                  },
                  {
                    step: 2,
                    title: "Tag Release Builds",
                    description:
                      "Tag your build artifacts with semantic versions (e.g. v1.2.0-beta.1, v1.0.0).",
                  },
                  {
                    step: 3,
                    title: "Live Links Published",
                    description:
                      "Active URLs and release notes appear here for client stakeholder signoff.",
                  },
                ]}
                actionText="Connect CI/CD Release Pipeline"
                onAction={() =>
                  openSetupTicket(
                    "Release Pipeline Connection Request",
                    `Hi RapidShift Engineering Team,\n\nPlease configure deployment release tracking for our project.\n\nRepository / Build Info:\n- Repository URL: \n- Target Environments: Staging, Production`,
                    "question"
                  )
                }
                isDark={isDark}
                accent={accent}
              />
            ) : (
              <div className="space-y-2">
                {releases.map((rel) => (
                  <div
                    key={rel.id}
                    className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${headingTextClass}`}>
                          {rel.version || rel.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          {rel.environment || "Production"}
                        </span>
                      </div>
                      <p className={`text-[11px] ${subtleTextClass} mt-0.5`}>
                        {rel.notes || "Software deployment release"}
                      </p>
                    </div>
                    {rel.url && (
                      <a
                        href={rel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1 shadow-xs transition"
                      >
                        <span>Launch</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 9: ANALYTICS                                                      */}
        {/* ========================================================================= */}
        {isAnalyticsWidget && (
          <div className="space-y-3">
            {!isAnalyticsConfigured ? (
              <div className="space-y-3">
                <NotConfiguredCard
                  icon={BarChart3}
                  badgeText="TRACKER PENDING INSTALLATION"
                  title="Cookieless Analytics Tracker Not Installed"
                  description="Privacy-preserving analytics, pageviews, repeat viewer journeys, origins, and Core Web Vitals require the RapidShift Tracker script in your web application."
                  benefits={[
                    "100% Cookieless & GDPR Compliant",
                    "Realtime Pageviews, Unique & Repeat Viewers",
                    "Core Web Vitals Telemetry (LCP, INP, CLS, FCP, TTFB)",
                    "Signed Data Offload to Your Data Warehouse",
                  ]}
                  steps={[
                    {
                      step: 1,
                      title: "Add Script Tag",
                      description: "Place the script tag in the <head> or root layout of your frontend application.",
                    },
                    {
                      step: 2,
                      title: "Deploy Application",
                      description: "Deploy the update to your staging or production hosting environment.",
                    },
                    {
                      step: 3,
                      title: "Instant Telemetry",
                      description: "Pageviews, repeat viewer journeys, and Core Web Vitals will stream into this embed automatically.",
                    },
                  ]}
                  actionText="Request Tracker Integration Help"
                  onAction={() =>
                    openSetupTicket(
                      "Analytics Tracker Integration Assistance",
                      `Hi RapidShift Team,\n\nWe need assistance integrating the RapidShift Cookieless Tracker script into our frontend framework.\n\nFrontend Framework (Next.js / Vite / React / Vue / HTML): `,
                      "question"
                    )
                  }
                  isDark={isDark}
                  accent={accent}
                />

                {/* Tracker Code Snippet Card */}
                <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2 text-xs`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${headingTextClass} flex items-center gap-1.5`}>
                      <Code2 className="w-3.5 h-3.5 text-blue-500" />
                      <span>Drop-In Tracker Snippet</span>
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `<script defer src="${
                            mounted && typeof window !== "undefined" ? window.location.origin : "https://rsl.alaqmar.dev"
                          }/t.js" data-client="${clientId}"></script>`,
                          "tracker-code"
                        )
                      }
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition cursor-pointer ${buttonSecondaryClass}`}
                    >
                      {copiedId === "tracker-code" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Snippet</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre
                    className={`p-2.5 rounded-lg border font-mono text-[11px] overflow-x-auto select-all ${
                      isDark ? "bg-black/80 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-800"
                    }`}
                  >
                    {`<script defer src="${
                      mounted && typeof window !== "undefined" ? window.location.origin : "https://rsl.alaqmar.dev"
                    }/t.js" data-client="${clientId}"></script>`}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 4-Card KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>
                      Pageviews (30d)
                    </p>
                    <p className="font-extrabold text-blue-500 text-base font-mono mt-0.5">
                      {formatNumber(analytics.pageviews)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>
                      Unique Visitors
                    </p>
                    <p className={`font-mono font-extrabold text-base mt-0.5 ${headingTextClass}`}>
                      {formatNumber(analytics.visitors)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>
                      Repeat Viewers
                    </p>
                    <p className="font-mono font-extrabold text-base text-indigo-500 mt-0.5">
                      {formatNumber(analytics.repeatVisitors || 0)}{" "}
                      <span className="text-[11px] font-semibold">
                        ({analytics.repeatRate || 0}%)
                      </span>
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass}`}>
                    <p className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>
                      Bounce Rate
                    </p>
                    <p className="font-mono font-extrabold text-base text-emerald-500 mt-0.5">
                      {analytics.bounceRate}%
                    </p>
                  </div>
                </div>

                {/* Traffic Trend Mini Chart (for analytics-overview, pageview-chart, traffic-chart, analytics-chart) */}
                {(widget === "analytics-overview" ||
                  widget === "analytics-chart" ||
                  widget === "pageview-chart" ||
                  widget === "traffic-chart" ||
                  widget.includes("analytics")) &&
                  analytics.timeseries &&
                  analytics.timeseries.length > 0 && (
                    <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-bold ${headingTextClass} flex items-center gap-1.5`}>
                          <Activity className="w-3.5 h-3.5 text-blue-500" />
                          <span>30-Day Traffic &amp; Repeat Viewer Trend</span>
                        </span>
                        <span className={`text-[10px] font-mono ${subtleTextClass}`}>
                          {analytics.activeVisitorsNow || 0} active now
                        </span>
                      </div>
                      {(() => {
                        const series = analytics.timeseries.slice(-14);
                        const maxPv = Math.max(...series.map((s) => s.pageviews), 1);
                        return (
                          <div className="h-24 flex items-end gap-1 pt-2">
                            {series.map((b) => {
                              const pct = Math.max(b.pageviews > 0 ? 10 : 3, Math.round((b.pageviews / maxPv) * 100));
                              return (
                                <div
                                  key={b.timestamp}
                                  title={`${b.date}: ${b.pageviews} views, ${b.uniqueVisitors} visitors (${b.repeatVisitors} repeat)`}
                                  className="flex-1 h-full flex items-end"
                                >
                                  <div
                                    style={{ height: `${pct}%` }}
                                    className={`w-full rounded-t ${
                                      b.pageviews > 0 ? "bg-blue-500 hover:bg-blue-400" : isDark ? "bg-zinc-800" : "bg-zinc-200"
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                {/* Top Routes & Origins ("From Where") */}
                {(widget === "analytics-overview" ||
                  widget === "top-pages" ||
                  widget === "pageview-chart" ||
                  widget === "traffic-chart" ||
                  widget.includes("analytics")) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass}`}>
                        Top Visited Pages
                      </p>
                      {(analytics.topPaths || []).length === 0 ? (
                        <p className={`text-xs ${subtleTextClass}`}>No routes recorded yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(analytics.topPaths || []).slice(0, 5).map((p) => (
                            <div key={p.key} className="flex items-center justify-between text-xs gap-2">
                              <span className={`font-mono truncate ${headingTextClass}`}>{p.key}</span>
                              <span className="font-mono font-bold text-blue-500 shrink-0">{p.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass}`}>
                        From Where (Countries &amp; Referrers)
                      </p>
                      <div className="space-y-1.5">
                        {(analytics.countries || []).slice(0, 3).map((c) => (
                          <div key={`c-${c.key}`} className="flex items-center justify-between text-xs">
                            <span className={headingTextClass}>Region: {c.key}</span>
                            <span className="font-mono font-bold text-indigo-500">{c.count}</span>
                          </div>
                        ))}
                        {(analytics.topReferrers || []).slice(0, 3).map((r) => (
                          <div key={`r-${r.key}`} className="flex items-center justify-between text-xs">
                            <span className={`truncate ${subtleTextClass}`}>via {r.key}</span>
                            <span className="font-mono font-bold text-emerald-500">{r.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Core Web Vitals Strip */}
                {(widget === "analytics-overview" || widget === "web-vitals") &&
                  analytics.webVitals &&
                  analytics.webVitals.length > 0 && (
                    <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass}`}>
                        Core Web Vitals (p75)
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {analytics.webVitals.map((v) => (
                          <div
                            key={v.name}
                            className={`p-2 rounded-lg border text-center ${
                              isDark ? "bg-zinc-900/70 border-zinc-800" : "bg-white border-zinc-200"
                            }`}
                          >
                            <div className={`text-[10px] font-mono font-bold ${subtleTextClass}`}>
                              {v.name}
                            </div>
                            <div className={`text-xs font-mono font-extrabold mt-0.5 ${headingTextClass}`}>
                              {v.name === "LCP" || v.name === "FCP"
                                ? `${(v.p75Value / 1000).toFixed(2)}s`
                                : v.name === "CLS"
                                ? v.p75Value.toFixed(3)
                                : `${Math.round(v.p75Value)}ms`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Recent Visitor Journeys */}
                {(widget === "analytics-overview" || widget === "visitor-journeys") &&
                  analytics.visitorSessions &&
                  analytics.visitorSessions.length > 0 && (
                    <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass}`}>
                        Recent Visitor Journeys
                      </p>
                      <div className="space-y-1.5">
                        {analytics.visitorSessions.slice(0, 4).map((s) => (
                          <div
                            key={s.sessionId}
                            className="flex flex-wrap items-center justify-between gap-2 text-[11px] py-1 border-b border-zinc-500/10 last:border-0"
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                  s.isRepeatViewer
                                    ? "bg-indigo-500/15 text-indigo-400"
                                    : "bg-emerald-500/15 text-emerald-400"
                                }`}
                              >
                                {s.isRepeatViewer ? `Repeat #${s.visitNumber}` : "New"}
                              </span>
                              <span className={`font-mono ${headingTextClass}`}>{s.entryPage}</span>
                            </div>
                            <div className={`font-mono text-[10px] ${subtleTextClass}`}>
                              {s.country} · {s.referrer} · {s.browser}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* IN-PLACE MODALS OVERLAY                                                   */}
        {/* ========================================================================= */}

        {/* MODAL 1: In-Place Payment Processing */}
        {activeModal === "pay" && selectedInvoice && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-md p-6 rounded-2xl border ${cardBgClass} space-y-5 relative shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <h3 className={`text-sm font-bold ${headingTextClass}`}>
                    Settle Invoice {selectedInvoice.invoiceNumber}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setActiveModal(null);
                    setPaymentReceipt(null);
                  }}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {paymentReceipt ? (
                <div className="space-y-4 text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-emerald-500">Payment Succeeded</h4>
                    <p className={`text-xs mt-1 font-mono ${subtleTextClass}`}>
                      Ref: {paymentReceipt.payment?.reference || "TXN-VERIFIED"}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl border ${itemBgClass} text-xs text-left space-y-1`}>
                    <div className="flex justify-between">
                      <span className={subtleTextClass}>Amount Settled</span>
                      <span className={`font-bold ${headingTextClass}`}>
                        ₹{formatMinorToINR(paymentReceipt.payment?.amountMinor || selectedInvoice.totalMinor)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={subtleTextClass}>Payment Mode</span>
                      <span className={`uppercase font-mono ${headingTextClass}`}>
                        {paymentReceipt.payment?.method || paymentMethod}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      setPaymentReceipt(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-3.5 rounded-xl border ${itemBgClass} flex items-center justify-between text-xs`}>
                    <span className={subtleTextClass}>Amount Outstanding</span>
                    <span className="font-extrabold text-base text-rose-500">
                      ₹{formatMinorToINR(
                        selectedInvoice.balanceMinor !== undefined
                          ? selectedInvoice.balanceMinor
                          : selectedInvoice.totalMinor
                      )}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${secondaryTextClass}`}>Select Payment Method</label>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(["upi", "bank_transfer", "card"] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`py-2 rounded-xl border text-center font-bold uppercase text-[10px] transition cursor-pointer ${
                            paymentMethod === method
                              ? "bg-blue-600 text-white border-blue-500 shadow-xs"
                              : isDark
                              ? "border-zinc-700/60 text-zinc-400 hover:text-white"
                              : "border-zinc-200 text-zinc-600 hover:text-zinc-900 bg-zinc-50"
                          }`}
                        >
                          {method.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handlePayInvoice(selectedInvoice.id)}
                    disabled={paymentProcessing}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    {paymentProcessing && <IosSpinner size="xs" className="text-white" />}
                    <span>{paymentProcessing ? "Processing Settlement..." : "Confirm & Settle Now"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL 2: In-Place Terminal Log Streamer */}
        {activeModal === "logs" && selectedProcess && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-xl p-5 rounded-2xl border ${cardBgClass} space-y-4 relative shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  <h3 className={`text-sm font-bold font-mono ${headingTextClass}`}>
                    {selectedProcess.name} &bull; Output Stream
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewLogs(selectedProcess)}
                    disabled={loadingLogs}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${buttonSecondaryClass}`}
                    title="Refresh Logs"
                  >
                    {loadingLogs ? (
                      <IosSpinner size="xs" className="text-current" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap select-all">
                {loadingLogs ? "Fetching live daemon output..." : logContent}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: In-Place New Ticket Creator */}
        {activeModal === "new-ticket" && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-md p-6 rounded-2xl border ${cardBgClass} space-y-4 relative shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div className="flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-blue-500" />
                  <h3 className={`text-sm font-bold ${headingTextClass}`}>Raise Support Ticket</h3>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${secondaryTextClass}`}>Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief description of the issue..."
                    value={newTicketForm.subject}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs transition ${inputBgClass}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${secondaryTextClass}`}>Priority Tier</label>
                    <select
                      value={newTicketForm.priority}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border font-semibold text-xs transition ${inputBgClass}`}
                    >
                      <option value="P1">P1 Critical (&lt;1h)</option>
                      <option value="P2">P2 High (&lt;4h)</option>
                      <option value="P3">P3 Normal (&lt;24h)</option>
                      <option value="P4">P4 Low</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold ${secondaryTextClass}`}>Category</label>
                    <select
                      value={newTicketForm.category}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border font-semibold text-xs transition ${inputBgClass}`}
                    >
                      <option value="question">Technical Question</option>
                      <option value="bug">Application Bug</option>
                      <option value="outage">Server Outage</option>
                      <option value="billing">Billing Inquiry</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${secondaryTextClass}`}>Message</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Provide details for engineering staff..."
                    value={newTicketForm.message}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, message: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs transition ${inputBgClass}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  {submittingTicket ? "Submitting Ticket..." : "Submit Ticket to Support Desk"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: In-Place Ticket Thread & Reply */}
        {activeModal === "ticket-thread" && selectedTicket && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-lg p-5 rounded-2xl border ${cardBgClass} space-y-4 relative shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div>
                  <h3 className={`text-sm font-bold ${headingTextClass}`}>{selectedTicket.subject}</h3>
                  <span className={`text-[11px] ${subtleTextClass}`}>
                    Priority: {selectedTicket.priority} &bull; Status: {selectedTicket.status}
                  </span>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`p-3 rounded-xl max-h-56 overflow-y-auto space-y-2 text-xs border ${itemBgClass}`}>
                {(selectedTicket.messages || []).length === 0 ? (
                  <p className={`text-center py-4 ${subtleTextClass}`}>No thread messages yet.</p>
                ) : (
                  (selectedTicket.messages || []).map((m: any, i: number) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg text-xs ${
                        m.authorType === "admin"
                          ? "bg-blue-500/10 border border-blue-500/20 text-zinc-900 dark:text-zinc-200"
                          : isDark
                          ? "bg-zinc-800/80 text-zinc-300"
                          : "bg-white border border-zinc-200 text-zinc-800"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 mb-1">
                        <span>{m.authorName || m.authorType}</span>
                        <span suppressHydrationWarning>{formatTime(m.createdAt)}</span>
                      </div>
                      <p className="leading-relaxed">{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a reply to engineering staff..."
                  value={ticketReplyText}
                  onChange={(e) => setTicketReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleReplyTicket(selectedTicket.id);
                  }}
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs transition ${inputBgClass}`}
                />
                <button
                  onClick={() => handleReplyTicket(selectedTicket.id)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shrink-0 shadow-xs transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: Invoice Breakdown Details (Itemized Lines & Taxes) */}
        {activeModal === "invoice-details" && selectedInvoice && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-lg p-6 rounded-2xl border ${cardBgClass} space-y-4 relative text-xs shadow-2xl`}>
              {/* Modal Header */}
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <div>
                    <h3 className={`text-sm font-bold font-mono ${headingTextClass}`}>
                      {selectedInvoice.invoiceNumber}
                    </h3>
                    <p className={`text-[10px] ${subtleTextClass}`} suppressHydrationWarning>
                      Issued: {formatDate(selectedInvoice.issueDate || selectedInvoice.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      selectedInvoice.status === "paid"
                        ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {selectedInvoice.status}
                  </span>
                  <button
                    onClick={() => setActiveModal(null)}
                    className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className={`p-2.5 rounded-xl border ${itemBgClass}`}>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>Due Date</span>
                  <p className={`font-semibold mt-0.5 ${headingTextClass}`} suppressHydrationWarning>
                    {formatDate(selectedInvoice.dueDate)}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl border ${itemBgClass}`}>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>Tax Mode</span>
                  <p className={`font-semibold mt-0.5 uppercase ${headingTextClass}`}>
                    {selectedInvoice.billingMode?.replace("_", " ") || "Non GST"}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl border ${itemBgClass} col-span-2 sm:col-span-1`}>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>Currency</span>
                  <p className={`font-semibold mt-0.5 ${headingTextClass}`}>
                    {selectedInvoice.currency || "INR (₹)"}
                  </p>
                </div>
              </div>

              {/* Itemized Line Items Breakdown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass}`}>
                    Itemized Line Items
                  </span>
                  <span className={`text-[10px] ${subtleTextClass}`}>
                    {(selectedInvoice.lines || []).length || 1} item{((selectedInvoice.lines || []).length || 1) > 1 ? "s" : ""}
                  </span>
                </div>

                <div className={`rounded-xl border ${itemBgClass} overflow-hidden`}>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className={`border-b ${headerBorderClass} text-[10px] uppercase tracking-wider font-semibold ${subtleTextClass}`}>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-2 text-center">SAC</th>
                        <th className="py-2 px-2 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-700/50">
                      {selectedInvoice.lines && selectedInvoice.lines.length > 0 ? (
                        selectedInvoice.lines.map((line: any, idx: number) => (
                          <tr key={line.id || idx}>
                            <td className="py-2.5 px-3">
                              <div className={`font-medium ${headingTextClass}`}>{line.description}</div>
                              {line.unitPriceMinor && line.quantity > 1 && (
                                <div className={`text-[10px] ${subtleTextClass}`}>
                                  {line.quantity} &times; ₹{formatMinorToINR(line.unitPriceMinor)}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-[10px] text-zinc-500">
                              {line.sacCode || "998311"}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-medium">
                              {line.quantity || 1}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold ${headingTextClass}`}>
                              ₹{formatMinorToINR(line.amountMinor || line.unitPriceMinor || 0)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2.5 px-3">
                            <div className={`font-medium ${headingTextClass}`}>
                              {selectedInvoice.notes || "Professional Engineering & Managed Platform Services"}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-[10px] text-zinc-500">
                            998311
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-medium">1</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${headingTextClass}`}>
                            ₹{formatMinorToINR(selectedInvoice.subtotalMinor)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tax & Total Summary Card */}
              <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-1.5`}>
                <div className="flex justify-between">
                  <span className={subtleTextClass}>Subtotal</span>
                  <span className={`font-semibold ${headingTextClass}`}>
                    ₹{formatMinorToINR(selectedInvoice.subtotalMinor)}
                  </span>
                </div>
                {selectedInvoice.cgstMinor > 0 && (
                  <div className="flex justify-between">
                    <span className={subtleTextClass}>CGST (9%)</span>
                    <span className={`font-semibold ${headingTextClass}`}>
                      ₹{formatMinorToINR(selectedInvoice.cgstMinor)}
                    </span>
                  </div>
                )}
                {selectedInvoice.sgstMinor > 0 && (
                  <div className="flex justify-between">
                    <span className={subtleTextClass}>SGST (9%)</span>
                    <span className={`font-semibold ${headingTextClass}`}>
                      ₹{formatMinorToINR(selectedInvoice.sgstMinor)}
                    </span>
                  </div>
                )}
                {selectedInvoice.igstMinor > 0 && (
                  <div className="flex justify-between">
                    <span className={subtleTextClass}>IGST (18%)</span>
                    <span className={`font-semibold ${headingTextClass}`}>
                      ₹{formatMinorToINR(selectedInvoice.igstMinor)}
                    </span>
                  </div>
                )}
                <div className={`flex justify-between border-t ${headerBorderClass} pt-2 font-bold`}>
                  <span className={headingTextClass}>Total Billed</span>
                  <span className="font-mono text-blue-500 text-sm">
                    ₹{formatMinorToINR(selectedInvoice.totalMinor)}
                  </span>
                </div>
                {selectedInvoice.balanceMinor !== undefined && selectedInvoice.balanceMinor > 0 && (
                  <div className="flex justify-between pt-0.5 font-bold">
                    <span className="text-rose-500">Balance Outstanding</span>
                    <span className="font-mono text-rose-500">
                      ₹{formatMinorToINR(selectedInvoice.balanceMinor)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1 gap-2">
                <a
                  href={`/api/v1/billing/invoices/${selectedInvoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className={`px-3 py-2 rounded-xl border inline-flex items-center gap-1.5 transition font-semibold ${buttonSecondaryClass}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Tax PDF</span>
                </a>
                {selectedInvoice.status !== "paid" && (
                  <button
                    onClick={() => setActiveModal("pay")}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold inline-flex items-center gap-1.5 shadow-md transition cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Pay Balance</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 6: In-Place Invoices Ledger Modal */}
        {activeModal === "invoices-modal" && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-lg p-5 rounded-2xl border ${cardBgClass} space-y-4 relative text-xs shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <h3 className={`text-sm font-bold ${headingTextClass}`}>Invoices Ledger</h3>
                <button
                  onClick={() => setActiveModal(null)}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {invoices.length === 0 ? (
                  <p className={`text-center py-6 ${subtleTextClass}`}>No invoices issued yet.</p>
                ) : (
                  invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className={`p-3 rounded-xl border ${itemBgClass} flex items-center justify-between`}
                    >
                      <div>
                        <span className={`font-mono font-bold ${headingTextClass}`}>{inv.invoiceNumber}</span>
                        <p className={`text-[10px] ${subtleTextClass}`}>
                          Total: ₹{formatMinorToINR(inv.totalMinor)} &bull; Status: {inv.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {inv.status !== "paid" && (
                          <button
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setActiveModal("pay");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setActiveModal("invoice-details");
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${buttonSecondaryClass}`}
                        >
                          Details
                        </button>
                        <a
                          href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className={`p-1 rounded-lg border transition ${buttonSecondaryClass}`}
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 7: In-Place Payments History Modal */}
        {activeModal === "payments-modal" && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-lg p-5 rounded-2xl border ${cardBgClass} space-y-4 relative text-xs shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <h3 className={`text-sm font-bold ${headingTextClass}`}>Payment History</h3>
                <button
                  onClick={() => setActiveModal(null)}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {payments.length === 0 ? (
                  <p className={`text-center py-6 ${subtleTextClass}`}>No payments recorded yet.</p>
                ) : (
                  payments.map((p) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border ${itemBgClass} flex items-center justify-between`}
                    >
                      <div>
                        <span className={`font-mono font-bold ${headingTextClass}`}>{p.reference || p.id}</span>
                        <p className={`text-[10px] ${subtleTextClass}`}>
                          <span suppressHydrationWarning>{formatDate(p.paymentDate)}</span> &bull;{" "}
                          {p.method?.toUpperCase()}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-emerald-500">
                        ₹{formatMinorToINR(p.amountMinor)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 8: Payment Receipt Details Modal */}
        {activeModal === "payment-receipt" && selectedPayment && (
          <div className={modalBackdropClass}>
            <div className={`w-full max-w-md p-6 rounded-2xl border ${cardBgClass} space-y-4 relative text-xs shadow-2xl`}>
              <div className={`flex items-center justify-between border-b pb-3.5 ${headerBorderClass}`}>
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  <div>
                    <h3 className={`text-sm font-bold font-mono ${headingTextClass}`}>Transaction Receipt</h3>
                    <p className={`text-[10px] ${subtleTextClass}`}>
                      Ref: {selectedPayment.reference || selectedPayment.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className={`p-1 rounded-lg transition cursor-pointer ${buttonSecondaryClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center py-2 space-y-1">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-emerald-500">Payment Verified</h4>
                <p className={`font-mono text-xl font-extrabold ${headingTextClass}`}>
                  ₹{formatMinorToINR(selectedPayment.amountMinor)}
                </p>
              </div>

              <div className={`p-3.5 rounded-xl border ${itemBgClass} space-y-2`}>
                <div className="flex justify-between">
                  <span className={subtleTextClass}>Payment Mode</span>
                  <span className={`font-mono uppercase font-semibold ${headingTextClass}`}>
                    {selectedPayment.method}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={subtleTextClass}>Settlement Date</span>
                  <span className={`font-semibold ${headingTextClass}`} suppressHydrationWarning>
                    {formatDateTime(selectedPayment.paymentDate)}
                  </span>
                </div>
                {selectedPayment.invoiceId && (
                  <div className="flex justify-between">
                    <span className={subtleTextClass}>Applied Invoice</span>
                    <span className={`font-mono font-semibold ${headingTextClass}`}>
                      {selectedPayment.invoiceId}
                    </span>
                  </div>
                )}
                {selectedPayment.recordedBy && (
                  <div className="flex justify-between">
                    <span className={subtleTextClass}>Recorded By</span>
                    <span className={`font-mono ${subtleTextClass}`}>{selectedPayment.recordedBy}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Close Receipt
              </button>
            </div>
          </div>
        )}
      </div>
  );
}

// =========================================================================
// REUSABLE SUB-COMPONENT: NOT CONFIGURED CARD
// =========================================================================
function NotConfiguredCard({
  icon: Icon,
  badgeText = "CONFIGURATION REQUIRED",
  title,
  description,
  benefitsTitle = "Key Features When Configured",
  benefits,
  stepsTitle = "Resolution Steps to Activate with Engineering Desk",
  steps,
  actionText = "Request Setup with Support Desk",
  onAction,
  isDark,
  accent = "#2563eb",
}: {
  icon: React.ElementType;
  badgeText?: string;
  title: string;
  description: string;
  benefitsTitle?: string;
  benefits?: string[];
  stepsTitle?: string;
  steps: Array<{
    step: number;
    title: string;
    description: string;
  }>;
  actionText?: string;
  onAction?: () => void;
  isDark: boolean;
  accent?: string;
}) {
  const cardBgClass = isDark
    ? "bg-zinc-900/60 border-zinc-800/80 text-zinc-200"
    : "bg-white border-zinc-200/90 text-zinc-800";
  const itemBgClass = isDark
    ? "bg-zinc-950/60 border-zinc-800/80 text-zinc-300"
    : "bg-zinc-50/90 border-zinc-200/80 text-zinc-700";
  const headingTextClass = isDark ? "text-zinc-100" : "text-zinc-900";
  const subtleTextClass = isDark ? "text-zinc-400" : "text-zinc-500";

  return (
    <div className={`p-4 sm:p-5 rounded-2xl border ${cardBgClass} space-y-4`}>
      {/* Top Banner */}
      <div className="flex items-start gap-3">
        <div
          className="p-2.5 rounded-xl border shrink-0 flex items-center justify-center"
          style={{
            backgroundColor: isDark ? "rgba(37, 99, 235, 0.12)" : "rgba(37, 99, 235, 0.08)",
            borderColor: isDark ? "rgba(37, 99, 235, 0.25)" : "rgba(37, 99, 235, 0.2)",
            color: accent,
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {badgeText}
            </span>
          </div>
          <h3 className={`text-sm font-bold tracking-tight ${headingTextClass}`}>
            {title}
          </h3>
          <p className={`text-xs ${subtleTextClass} leading-relaxed`}>
            {description}
          </p>
        </div>
      </div>

      {/* Benefits checklist */}
      {benefits && benefits.length > 0 && (
        <div className={`p-3 rounded-xl border ${itemBgClass} space-y-1.5`}>
          <p className={`text-[10px] uppercase font-bold tracking-wider ${subtleTextClass}`}>
            {benefitsTitle}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className={headingTextClass}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step by Step Resolution Guide */}
      <div className="space-y-2">
        <p className={`text-[11px] font-bold uppercase tracking-wider ${subtleTextClass} flex items-center gap-1.5`}>
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>{stepsTitle}</span>
        </p>

        <div className="space-y-1.5">
          {steps.map((st) => (
            <div
              key={st.step}
              className={`p-2.5 rounded-xl border ${itemBgClass} flex items-start gap-2.5 text-xs`}
            >
              <span className="w-5 h-5 rounded-full bg-blue-600/15 text-blue-500 font-bold text-[10px] flex items-center justify-center font-mono shrink-0 mt-0.5 border border-blue-500/20">
                {st.step}
              </span>
              <div className="space-y-0.5 flex-1">
                <p className={`font-semibold ${headingTextClass}`}>{st.title}</p>
                <p className={`text-[11px] ${subtleTextClass} leading-snug`}>{st.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* In-place Action Button */}
      {onAction && (
        <button
          onClick={onAction}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
        >
          <LifeBuoy className="w-4 h-4" />
          <span>{actionText}</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-70" />
        </button>
      )}
    </div>
  );
}
