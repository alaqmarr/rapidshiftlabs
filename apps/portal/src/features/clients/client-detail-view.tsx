"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  Building,
  Key,
  Mail,
  FileText,
  Receipt,
  CreditCard,
  Server,
  Globe,
  ArrowLeft,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  Eye,
  EyeOff,
  Edit2,
  CheckCircle2,
  X,
  RefreshCw,
  Search,
  Lock,
  GitBranch,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import {
  INDIAN_STATES,
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCY_LIST,
  validatePincode,
  validateGstin,
  validatePan,
  formatCurrency as kernelFormatCurrency,
  getCurrencySymbol,
} from "@/lib/currency";

export interface ClientDetailProps {
  client: {
    id: string;
    name: string;
    slug: string;
    gstin?: string;
    pan?: string;
    billingMode: "gst" | "non_gst";
    currency: string;
    status: "active" | "inactive" | "suspended";
    city?: string;
    state?: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    country?: string;
    notes?: string;
    githubRepo?: string;
    githubBranch?: string;
    createdAt: number;
    contacts: Array<{ id: string; name: string; email: string; phone?: string; isPrimary: boolean }>;
    projects: Array<{ id: string; name: string; slug: string; status: string }>;
    portalUsers: Array<{ id: string; name: string; email: string; role: string; status: string; createdAt: number }>;
  };
  contracts: Array<{
    id: string;
    code: string;
    amountMinor: number;
    currency: string;
    billingCycle: string;
    status: string;
    validFrom: number;
    validTo: number;
    createdAt: number;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    totalMinor: number;
    balanceDueMinor: number;
    dueDate: number;
    issuedAt?: number;
    createdAt: number;
  }>;
  payments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    method: string;
    reference?: string;
    paymentDate: number;
    notes?: string;
  }>;
  apiKeys: Array<{
    id: string;
    keyPrefix: string;
    name: string;
    scopes: string[];
    status: string;
    createdAt: number;
    lastUsedAt?: number;
  }>;
  billingSummary: {
    totalBilledMinor: number;
    totalPaidMinor: number;
    outstandingMinor: number;
    overdueCount: number;
    activeInvoicesCount: number;
  };
  entitlement?: {
    status: string;
    allowed: boolean;
    reason?: string;
    manualOverride?: { mode: string };
  };
  monitoredDomains: Array<{
    id: string;
    hostname: string;
    status: string;
    sslStatus: string;
    dnsStatus: string;
    lastCheckedAt?: number;
  }>;
  healthReport?: {
    overallScore: number;
    tier: "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";
    summary: string;
    factors: {
      billing: { name: string; weightPercent: number; score: number; status: string; details: string };
      fleet: { name: string; weightPercent: number; score: number; status: string; details: string };
      monitoring: { name: string; weightPercent: number; score: number; status: string; details: string };
      support: { name: string; weightPercent: number; score: number; status: string; details: string };
    };
    recommendations: string[];
  };
}

export function ClientDetailView({
  client: initialClient,
  contracts,
  invoices,
  payments,
  apiKeys,
  billingSummary,
  entitlement,
  monitoredDomains,
  healthReport,
}: ClientDetailProps) {
  const [client, setClient] = useState(initialClient);
  const [activeTab, setActiveTab] = useState<
    "users" | "overview" | "contracts" | "invoices" | "payments" | "apiKeys" | "monitoring"
  >("users");

  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialMode, setCredentialMode] = useState<"direct" | "invite">("direct");
  const [credentialsForm, setCredentialsForm] = useState({
    name: client.contacts[0]?.name || "",
    email: client.contacts[0]?.email || "",
    password: "",
    role: "client_admin" as "client_admin" | "client_member",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: client.name,
    slug: client.slug,
    country: client.country || "IN",
    currency: client.currency || "INR",
    billingMode: client.billingMode,
    gstin: client.gstin || "",
    pan: client.pan || "",
    addressLine1: client.addressLine1 || "",
    addressLine2: client.addressLine2 || "",
    city: client.city || "",
    state: client.state || (client.country === "IN" || !client.country ? "Karnataka" : ""),
    postalCode: client.postalCode || "",
    status: client.status,
    githubRepo: (client as any).githubRepo || "",
    githubBranch: (client as any).githubBranch || "main",
  });
  const [editFormErrors, setEditFormErrors] = useState<{
    gstin?: string;
    pan?: string;
    postalCode?: string;
  }>({});

  const [contractsList, setContractsList] = useState(contracts);
  const [invoicesList, setInvoicesList] = useState(invoices);
  const [paymentsList, setPaymentsList] = useState(payments);
  const [apiKeysList, setApiKeysList] = useState(apiKeys);
  const [domainsList, setDomainsList] = useState(monitoredDomains);
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);
  const [currentEntitlement, setCurrentEntitlement] = useState(entitlement);
  const [currentSummary, setCurrentSummary] = useState(billingSummary);

  // Modals for actions on this client page
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({
    title: "Engineering Retainer & SLA",
    amountMajor: "25000",
    billingCycle: "monthly",
    intervalCount: 1,
    anchorDay: 1,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    taxProfile: client.billingMode === "gst" ? "gst_18" : "non_gst",
  });

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    description: "Cloud Engineering & Architectural Retainer",
    amountMajor: "25000",
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    billingMode: client.billingMode,
    issueImmediately: true,
  });

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "Production Access Gate",
    type: "secret" as "secret" | "publishable",
    scopes: ["access:read"],
  });

  const [showDomainModal, setShowDomainModal] = useState(false);
  const [domainForm, setDomainForm] = useState({
    name: `${client.name} Web App`,
    hostname: `${client.slug}.rapidshift.app`,
    port: "443",
  });

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    mode: ((entitlement as any)?.manualOverride?.mode || "allow") as "allow" | "block" | "maintenance",
    validUntil: "",
    note: (entitlement as any)?.reason || "",
  });

  const generateStrongPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pwd = "RSL-";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const { showSuccess, showError, showAlert } = useAlert();

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const amountMinor = Math.round(Number(contractForm.amountMajor) * 100);
      const res = await fetch("/api/v1/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          title: contractForm.title,
          amountMinor,
          currency: client.currency || "INR",
          billingCycle: contractForm.billingCycle,
          intervalCount: Number(contractForm.intervalCount),
          anchorDay: Number(contractForm.anchorDay),
          validFrom: contractForm.validFrom,
          validTo: contractForm.validTo,
          taxProfile: contractForm.taxProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create contract");

      const newContract = {
        id: data.contract.id,
        code: data.contract.code,
        amountMinor,
        currency: client.currency || "INR",
        billingCycle: contractForm.billingCycle,
        status: data.contract.status || "draft",
        validFrom: new Date(contractForm.validFrom).getTime(),
        validTo: new Date(contractForm.validTo).getTime(),
        createdAt: Date.now(),
      };
      setContractsList((prev) => [newContract, ...prev]);
      setShowContractModal(false);

      showSuccess(
        "Contract Created Successfully",
        `New contract '${contractForm.title}' (${data.contract.code}) was created for ${client.name}.`,
        [
          { label: "Contract Code", value: data.contract.code, copyable: true },
          { label: "Client", value: client.name },
          { label: "Recurring Value", value: formatCurrency(amountMinor) },
          { label: "Billing Cycle", value: contractForm.billingCycle.toUpperCase() },
          { label: "Validity", value: `${contractForm.validFrom} to ${contractForm.validTo}` },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create contract";
      showError("Contract Creation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const unitPriceMinor = Math.round(Number(invoiceForm.amountMajor) * 100);
      const res = await fetch("/api/v1/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          billingMode: invoiceForm.billingMode,
          dueDate: invoiceForm.dueDate,
          issueImmediately: invoiceForm.issueImmediately,
          lines: [
            {
              description: invoiceForm.description,
              unitPriceMinor,
              quantity: 1,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");

      const newInv = {
        id: data.invoice.id,
        invoiceNumber: data.invoice.invoiceNumber,
        status: data.invoice.status || (invoiceForm.issueImmediately ? "issued" : "draft"),
        totalMinor: data.invoice.totalMinor || unitPriceMinor,
        balanceDueMinor: data.invoice.balanceMinor || unitPriceMinor,
        dueDate: new Date(invoiceForm.dueDate).getTime(),
        issuedAt: invoiceForm.issueImmediately ? Date.now() : undefined,
        createdAt: Date.now(),
      };
      setInvoicesList((prev) => [newInv, ...prev]);
      setCurrentSummary((prev) => ({
        ...prev,
        totalBilledMinor: prev.totalBilledMinor + newInv.totalMinor,
        outstandingMinor: prev.outstandingMinor + newInv.balanceDueMinor,
        activeInvoicesCount: prev.activeInvoicesCount + 1,
      }));
      setShowInvoiceModal(false);

      showSuccess(
        "Invoice Generated",
        `Invoice ${data.invoice.invoiceNumber} has been generated for ${client.name}.`,
        [
          { label: "Invoice Number", value: data.invoice.invoiceNumber, copyable: true },
          { label: "Amount Due", value: formatCurrency(newInv.totalMinor) },
          { label: "Due Date", value: invoiceForm.dueDate },
          { label: "Status", value: newInv.status.toUpperCase() },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate invoice";
      showError("Invoice Generation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          name: apiKeyForm.name,
          type: apiKeyForm.type,
          scopes: apiKeyForm.scopes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate API key");

      const newKey = {
        id: data.apiKey.id,
        keyPrefix: data.apiKey.keyPrefix,
        name: data.apiKey.name,
        scopes: Array.isArray(data.apiKey.scopes) ? data.apiKey.scopes : Array.from(data.apiKey.scopes || []),
        status: "active",
        createdAt: Date.now(),
      };
      setApiKeysList((prev) => [newKey, ...prev]);
      setShowApiKeyModal(false);

      showSuccess(
        "API Key Generated",
        `A new ${apiKeyForm.type} API key was created for ${client.name}. Copy the secret key value below now. It will never be displayed again.`,
        [
          { label: "Key Name", value: apiKeyForm.name },
          { label: "Key Type", value: apiKeyForm.type.toUpperCase() },
          { label: "Secret Key", value: data.rawKey, copyable: true, isMonospace: true },
          { label: "Key Prefix", value: data.apiKey.keyPrefix },
          { label: "Scopes", value: apiKeyForm.scopes.join(", ") },
        ],
        data.rawKey
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate API key";
      showError("Key Generation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          name: domainForm.name,
          hostname: domainForm.hostname,
          port: Number(domainForm.port) || 443,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register domain");

      const newDom = {
        id: data.domain.id,
        hostname: data.domain.hostname,
        status: data.domain.status || "pending",
        sslStatus: data.domain.sslStatus || "pending",
        dnsStatus: data.domain.dnsStatus || "pending",
        lastCheckedAt: undefined,
      };
      setDomainsList((prev) => [newDom, ...prev]);
      setShowDomainModal(false);

      showSuccess(
        "Domain Registered for Monitoring",
        `Domain ${domainForm.hostname} is now enrolled in daemon checks (HTTP, SSL certificate, and DNS).`,
        [
          { label: "Hostname", value: domainForm.hostname, copyable: true },
          { label: "Service Name", value: domainForm.name },
          { label: "Port", value: String(domainForm.port) },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register domain";
      showError("Domain Registration Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunDomainCheck = async (domainId: string, hostname: string) => {
    setCheckingDomainId(domainId);
    try {
      const res = await fetch(`/api/v1/admin/domains/${domainId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkType: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Diagnostic check failed");

      if (data.domain) {
        setDomainsList((prev) =>
          prev.map((d) =>
            d.id === domainId
              ? {
                  ...d,
                  status: data.domain.status,
                  sslStatus: data.domain.sslStatus || "pending",
                  dnsStatus: data.domain.dnsStatus || "pending",
                  lastCheckedAt: data.domain.lastHttpCheckAt,
                }
              : d
          )
        );
        showSuccess(
          "Diagnostics Verification Complete",
          `Live probe passed for '${hostname}'. Health status: ${data.domain.status.toUpperCase()}.`,
          [
            { label: "Hostname", value: hostname },
            { label: "Status", value: data.domain.status.toUpperCase() },
            { label: "HTTP Latency", value: data.domain.lastLatencyMs ? `${data.domain.lastLatencyMs}ms` : "OK" },
            { label: "SSL Certificate", value: data.domain.sslStatus ? `${data.domain.sslStatus.toUpperCase()} (${data.domain.sslDaysRemaining ?? 0}d left)` : "Pending" },
            { label: "DNS Status", value: data.domain.dnsStatus || "Pending" },
          ]
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Diagnostics check failed";
      showError("Diagnostics Check Failed", msg);
    } finally {
      setCheckingDomainId(null);
    }
  };

  const handleSetOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const validUntilTs = overrideForm.validUntil ? new Date(overrideForm.validUntil).getTime() : null;
      const res = await fetch(`/api/v1/admin/entitlements/${client.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: overrideForm.mode,
          validUntil: validUntilTs,
          note: overrideForm.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set override");

      setCurrentEntitlement({
        status: overrideForm.mode === "allow" ? "active" : overrideForm.mode === "block" ? "blocked" : "maintenance",
        allowed: overrideForm.mode === "allow",
        reason: overrideForm.note,
        manualOverride: { mode: overrideForm.mode },
      });
      setShowOverrideModal(false);

      showSuccess(
        "Access Gate Override Applied",
        `Entitlement state for ${client.name} is now manually overridden to '${overrideForm.mode.toUpperCase()}'.`,
        [
          { label: "Client", value: client.name },
          { label: "Override Mode", value: overrideForm.mode.toUpperCase() },
          { label: "Access Status", value: overrideForm.mode === "allow" ? "ALLOWED (Pass Issued)" : "BLOCKED" },
          ...(overrideForm.validUntil ? [{ label: "Expires At", value: overrideForm.validUntil }] : []),
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply gate override";
      showError("Override Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearOverride = async () => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/entitlements/${client.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear override");

      setCurrentEntitlement({
        status: "active",
        allowed: true,
        reason: undefined,
        manualOverride: undefined,
      });
      setShowOverrideModal(false);

      showSuccess(
        "Gate Override Removed",
        `Manual override was removed for ${client.name}. Access gating is now evaluated dynamically based on contract & invoice status.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clear override";
      showError("Clear Override Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload: { name: string; email: string; role: string; password?: string } = {
        name: credentialsForm.name,
        email: credentialsForm.email,
        role: credentialsForm.role,
      };

      if (credentialMode === "direct" && credentialsForm.password.trim()) {
        payload.password = credentialsForm.password.trim();
      }

      const res = await fetch(`/api/v1/admin/clients/${client.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        user?: { id: string; email: string; name: string; password?: string; tempPassword?: string };
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || "Failed to create credentials");

      const finalPassword =
        credentialMode === "direct"
          ? credentialsForm.password || data.user?.password
          : data.user?.password || data.user?.tempPassword;
      const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login";

      const copyPayload = `RapidShift Labs Client Portal Access\nOrganization: ${client.name}\nLogin URL: ${portalUrl}\nEmail: ${data.user?.email || credentialsForm.email}${finalPassword ? `\nPassword: ${finalPassword}` : ""}`;

      showSuccess(
        credentialMode === "direct" ? "Client Credentials Created" : "Client Portal Invitation Sent",
        `User account is now registered for ${client.name}. Credentials can be copied and shared below.`,
        [
          { label: "Organization", value: client.name },
          { label: "User Name", value: credentialsForm.name },
          { label: "Login Email", value: data.user?.email || credentialsForm.email, copyable: true },
          ...(finalPassword
            ? [{ label: "Password", value: finalPassword, copyable: true, isMonospace: true }]
            : []),
          { label: "Portal URL", value: portalUrl, copyable: true },
        ],
        copyPayload,
      );

      setShowCredentialsModal(false);
      setCredentialsForm({
        name: "",
        email: "",
        password: "",
        role: "client_admin",
      });

      // Update local portal users list
      if (data.user) {
        setClient((prev) => {
          const exists = prev.portalUsers.some(
            (u) => u.email.toLowerCase() === data.user!.email.toLowerCase()
          );
          const updatedUsers = exists
            ? prev.portalUsers.map((u) =>
                u.email.toLowerCase() === data.user!.email.toLowerCase()
                  ? { ...u, name: data.user!.name, role: payload.role, status: "active" as const }
                  : u
              )
            : [
                ...prev.portalUsers,
                {
                  id: data.user!.id,
                  name: data.user!.name,
                  email: data.user!.email,
                  role: payload.role,
                  status: "active" as const,
                  createdAt: Date.now(),
                },
              ];
          return { ...prev, portalUsers: updatedUsers };
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create credentials";
      showError("Credential Creation Failed", msg, [
        { label: "Client ID", value: client.id },
        { label: "Target Email", value: credentialsForm.email },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { gstin?: string; pan?: string; postalCode?: string } = {};

    // Validate pincode if entered
    if (editFormData.postalCode.trim()) {
      const pinResult = validatePincode(editFormData.postalCode, editFormData.country);
      if (!pinResult.valid) {
        errors.postalCode = pinResult.error;
      }
    }

    // Validate GSTIN if entered or if GST mode selected
    if (editFormData.gstin.trim()) {
      const gstinResult = validateGstin(editFormData.gstin, editFormData.state);
      if (!gstinResult.valid) {
        errors.gstin = gstinResult.error;
      }
    } else if (editFormData.billingMode === "gst") {
      errors.gstin = "GSTIN is mandatory when GST billing mode is enabled.";
    }

    // Validate PAN if entered
    if (editFormData.pan.trim()) {
      const panResult = validatePan(editFormData.pan, editFormData.gstin);
      if (!panResult.valid) {
        errors.pan = panResult.error;
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      showError("Validation Error", "Please resolve the highlighted validation issues before saving.");
      return;
    }

    setEditFormErrors({});

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update client");

      setClient((prev) => ({ ...prev, ...editFormData }));
      setShowEditModal(false);
      showSuccess(
        "Organization Profile Updated",
        `Changes to '${editFormData.name}' have been saved.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update organization";
      showError("Update Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (minor: number, curr?: string) => {
    return kernelFormatCurrency(minor, curr || client.currency || "INR");
  };

  const formatDate = (ms: number | string | undefined) => {
    if (!ms) return "—";
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Client Workspace Action Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/clients"
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition"
              title="Return to Clients Directory"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shadow-xs font-bold text-sm">
                {client.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold leading-none text-zinc-900 dark:text-white">{client.name}</h1>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      client.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                    }`}
                  >
                    {client.status}
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-400 mt-1">Tenant ID: {client.slug}</p>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCredentialMode("direct");
                setCredentialsForm({
                  name: client.contacts[0]?.name || "",
                  email: client.contacts[0]?.email || "",
                  password: generateStrongPassword(),
                  role: "client_admin",
                });
                setShowPassword(true);
                setShowCredentialsModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
              title="Create Credentials Directly"
              data-testid="client-page-create-credentials"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Create Credentials</span>
              <span className="sm:hidden">Credentials</span>
            </button>

            <button
              onClick={() => {
                setCredentialMode("invite");
                setCredentialsForm({
                  name: client.contacts[0]?.name || "",
                  email: client.contacts[0]?.email || "",
                  password: "",
                  role: "client_admin",
                });
                setShowCredentialsModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer"
              title="Send Portal Invite"
              data-testid="client-page-send-invite"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send Invite</span>
              <span className="sm:hidden">Invite</span>
            </button>

            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold transition cursor-pointer"
              title="Edit Organization Profile"
              data-testid="client-edit-btn"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit Client</span>
              <span className="sm:hidden">Edit</span>
            </button>

            {client.slug && (
              <Link
                href={`/status/${client.slug}`}
                target="_blank"
                className="hidden md:inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 border border-zinc-200 dark:border-zinc-700 px-3 py-2 rounded-lg transition"
              >
                <Globe className="w-3.5 h-3.5" />
                Status Page
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-6 flex-1">
        {/* KPI Cards Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Health Index (360°)</div>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold tracking-wider uppercase ${
                  (healthReport?.overallScore ?? 100) >= 85
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60"
                    : (healthReport?.overallScore ?? 100) >= 70
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60"
                    : (healthReport?.overallScore ?? 100) >= 50
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60"
                    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/60"
                }`}
              >
                {healthReport?.tier || "EXCELLENT"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  (healthReport?.overallScore ?? 100) >= 85
                    ? "bg-emerald-500"
                    : (healthReport?.overallScore ?? 100) >= 70
                    ? "bg-blue-500"
                    : (healthReport?.overallScore ?? 100) >= 50
                    ? "bg-amber-500 animate-pulse"
                    : "bg-red-500 animate-ping"
                }`}
              />
              <span className="text-xl font-bold text-zinc-900 dark:text-white font-mono">
                {healthReport?.overallScore ?? 100}%
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 truncate">
              {healthReport?.summary || "Operations stable"}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Outstanding Dues</div>
            <div className={`text-xl font-bold mt-1 ${currentSummary.outstandingMinor > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(currentSummary.outstandingMinor)}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Billed: {formatCurrency(currentSummary.totalBilledMinor)}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Active Contracts</div>
            <div className="text-xl font-bold mt-1 text-zinc-900 dark:text-white">
              {contractsList.filter((c) => c.status === "active").length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              Total Signed: {contractsList.length}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Portal Accounts</div>
            <div className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400">
              {client.portalUsers.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {client.portalUsers.filter((u) => u.role === "client_admin").length} Admins, {client.portalUsers.filter((u) => u.role !== "client_admin").length} Members
            </div>
          </div>

          <div
            onClick={() => setShowOverrideModal(true)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm hover:border-blue-400 dark:hover:border-blue-600 cursor-pointer transition"
            title="Click to configure Access Gate override"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Access Gate State</div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline">Override</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  currentEntitlement?.allowed ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="text-xl font-bold text-zinc-900 dark:text-white capitalize">
                {currentEntitlement?.status || "Active"}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {currentEntitlement?.manualOverride ? `Override: ${currentEntitlement.manualOverride.mode}` : "Evaluated Realtime"}
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex space-x-2 overflow-x-auto pb-1" aria-label="Client Tabs">
            {[
              { id: "users", label: "Portal Accounts & Credentials", icon: Key, count: client.portalUsers.length },
              { id: "overview", label: "Organization Info", icon: Building },
              { id: "contracts", label: "Contracts", icon: FileText, count: contractsList.length },
              { id: "invoices", label: "Invoices", icon: Receipt, count: invoicesList.length },
              { id: "payments", label: "Remittances", icon: CreditCard, count: paymentsList.length },
              { id: "apiKeys", label: "API Keys & Gate", icon: ShieldCheck, count: apiKeysList.length },
              { id: "monitoring", label: "Domain Monitoring", icon: Globe, count: domainsList.length },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </section>

        {/* TAB 1: USERS & CREDENTIALS */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Portal Accounts &amp; Credentials</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Manage login users for {client.name}. Provision direct passwords or send email setup invites.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCredentialMode("direct");
                    setCredentialsForm({
                      name: client.contacts[0]?.name || "",
                      email: client.contacts[0]?.email || "",
                      password: generateStrongPassword(),
                      role: "client_admin",
                    });
                    setShowPassword(true);
                    setShowCredentialsModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  Create Credentials Directly
                </button>

                <button
                  onClick={() => {
                    setCredentialMode("invite");
                    setCredentialsForm({
                      name: client.contacts[0]?.name || "",
                      email: client.contacts[0]?.email || "",
                      password: "",
                      role: "client_admin",
                    });
                    setShowCredentialsModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Send Email Invite
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {client.portalUsers.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                    <Key className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-white">No Portal Users Yet</h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Create the first client portal user account with direct credentials or send an email invitation.
                  </p>
                  <button
                    onClick={() => {
                      setCredentialMode("direct");
                      setCredentialsForm({
                        name: client.contacts[0]?.name || "",
                        email: client.contacts[0]?.email || "",
                        password: generateStrongPassword(),
                        role: "client_admin",
                      });
                      setShowPassword(true);
                      setShowCredentialsModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Create First User Credentials
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                      <tr>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Created Date</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {client.portalUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Key className="w-3.5 h-3.5 text-blue-500" />
                            {user.name}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-300">
                            {user.email}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                user.role === "client_admin"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                                  : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                              }`}
                            >
                              {user.role === "client_admin" ? "Admin" : "Member"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-500">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setCredentialMode("direct");
                                setCredentialsForm({
                                  name: user.name,
                                  email: user.email,
                                  password: generateStrongPassword(),
                                  role: user.role as any,
                                });
                                setShowPassword(true);
                                setShowCredentialsModal(true);
                              }}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              Reset / Re-create Password
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer 360 Health & Autonomous Diagnostics Widget */}
            <div className="md:col-span-2 bg-gradient-to-br from-white to-zinc-50/80 dark:from-zinc-900 dark:to-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Customer 360 &amp; Operational Health Intelligence</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Composite Score:</span>
                  <span className="font-mono font-bold text-sm text-zinc-900 dark:text-white">{healthReport?.overallScore ?? 100}/100</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    (healthReport?.overallScore ?? 100) >= 85
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200"
                      : (healthReport?.overallScore ?? 100) >= 70
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200"
                  }`}>
                    {healthReport?.tier || "EXCELLENT"}
                  </span>
                </div>
              </div>

              {/* 4 Factor Breakdown Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                {/* Billing */}
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-500">
                    <span className="font-medium">Billing Stability (35%)</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-white">{healthReport?.factors?.billing?.score ?? 100}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${healthReport?.factors?.billing?.score ?? 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">{healthReport?.factors?.billing?.details || "All dues clear"}</div>
                </div>

                {/* Fleet */}
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-500">
                    <span className="font-medium">Fleet &amp; PM2 (25%)</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-white">{healthReport?.factors?.fleet?.score ?? 100}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${healthReport?.factors?.fleet?.score ?? 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">{healthReport?.factors?.fleet?.details || "Processes healthy"}</div>
                </div>

                {/* Domains */}
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-500">
                    <span className="font-medium">Domains &amp; SSL (20%)</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-white">{healthReport?.factors?.monitoring?.score ?? 100}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${healthReport?.factors?.monitoring?.score ?? 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">{healthReport?.factors?.monitoring?.details || "Endpoints active"}</div>
                </div>

                {/* Support */}
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-500">
                    <span className="font-medium">Support &amp; SLA (20%)</span>
                    <span className="font-bold font-mono text-zinc-900 dark:text-white">{healthReport?.factors?.support?.score ?? 100}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-600 rounded-full" style={{ width: `${healthReport?.factors?.support?.score ?? 100}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">{healthReport?.factors?.support?.details || "SLA compliance active"}</div>
                </div>
              </div>

              {/* Recommendations list */}
              {healthReport?.recommendations && healthReport.recommendations.length > 0 && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 space-y-1.5">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Autonomous Insights &amp; Recommendations:</span>
                  <div className="flex flex-wrap gap-2">
                    {healthReport.recommendations.map((rec, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>{rec}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <h3 className="font-bold text-sm">
                  Legal &amp; Tax Information
                </h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/60 dark:border-blue-800/60 transition cursor-pointer"
                  title="Edit Organization Profile"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit Profile</span>
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Legal Entity:</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">{client.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Billing Mode:</span>
                  <span className="font-semibold uppercase">{client.billingMode}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">GSTIN:</span>
                  <span className="font-mono font-semibold">{client.gstin || "Not configured"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">PAN:</span>
                  <span className="font-mono font-semibold">{client.pan || "Not configured"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Currency:</span>
                  <span className="font-semibold">{client.currency}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">State / Region:</span>
                  <span>{client.state || "Not specified"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">City / Address:</span>
                  <span>{client.city ? `${client.city}, ${client.addressLine1 || ""}` : "Not specified"}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm border-b border-zinc-200 dark:border-zinc-800 pb-2">
                Primary Contacts
              </h3>
              {client.contacts.length === 0 ? (
                <p className="text-xs text-zinc-500">No primary contacts registered.</p>
              ) : (
                <div className="space-y-3">
                  {client.contacts.map((contact) => (
                    <div key={contact.id} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-white">
                        <span>{contact.name}</span>
                        {contact.isPrimary && (
                          <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.2 rounded text-[10px]">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500 font-mono">{contact.email}</div>
                      {contact.phone && <div className="text-zinc-400">{contact.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CONTRACTS */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Contracts &amp; Engagements</h3>
                <p className="text-xs text-zinc-500">Agreed commercial tenure, retainer schedules, and billing cycles.</p>
              </div>
              <button
                onClick={() => setShowContractModal(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                New Contract
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {contractsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No contracts registered for this client.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Contract Code</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Billing Cycle</th>
                      <th className="py-3 px-4">Tenure</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Agreement PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {contractsList.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-zinc-900 dark:text-white">{c.code}</td>
                        <td className="py-3 px-4 font-semibold">{formatCurrency(c.amountMinor, c.currency)}</td>
                        <td className="py-3 px-4 capitalize">{c.billingCycle}</td>
                        <td className="py-3 px-4 text-zinc-500">{formatDate(c.validFrom)} – {formatDate(c.validTo)}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <a
                            href={`/api/v1/billing/contracts/${c.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-[11px] font-medium transition"
                          >
                            <FileText className="w-3 h-3" />
                            PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: INVOICES */}
        {activeTab === "invoices" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Issued &amp; Pending Invoices</h3>
                <p className="text-xs text-zinc-500">Official tax invoices, payment countdowns, and balance tracking.</p>
              </div>
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Generate Invoice
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {invoicesList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No invoices issued yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Total Amount</th>
                      <th className="py-3 px-4">Balance Due</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {invoicesList.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-zinc-900 dark:text-white">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4 font-semibold">{formatCurrency(inv.totalMinor)}</td>
                        <td className={`py-3 px-4 font-semibold ${inv.balanceDueMinor > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {formatCurrency(inv.balanceDueMinor)}
                        </td>
                        <td className="py-3 px-4 text-zinc-500">{formatDate(inv.dueDate)}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <a
                            href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                            target="_blank"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Download PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: REMITTANCES */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Payment Remittances Ledger</h3>
                <p className="text-xs text-zinc-500">Historical recorded payments and bank settlements.</p>
              </div>
              <Link
                href="/admin/payments"
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Payment
              </Link>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {paymentsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No payment records logged.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Payment Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Reference / UTR</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {paymentsList.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4 text-zinc-500">{formatDate(p.paymentDate)}</td>
                        <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amountMinor)}</td>
                        <td className="py-3 px-4 uppercase font-semibold">{p.method}</td>
                        <td className="py-3 px-4 font-mono">{p.reference || "N/A"}</td>
                        <td className="py-3 px-4 text-zinc-500">{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: API KEYS */}
        {activeTab === "apiKeys" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Gate Integration &amp; API Keys</h3>
                <p className="text-xs text-zinc-500">Used by client application middleware for access gating.</p>
              </div>
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Generate API Key
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {apiKeysList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No API keys generated yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Key Prefix</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Scopes</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4">Last Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {apiKeysList.map((k) => (
                      <tr key={k.id}>
                        <td className="py-3 px-4 font-mono font-bold">{k.keyPrefix}...</td>
                        <td className="py-3 px-4">{k.name}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                            {k.scopes.join(", ")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {k.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500">{formatDate(k.createdAt)}</td>
                        <td className="py-3 px-4 text-zinc-500">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: MONITORING */}
        {activeTab === "monitoring" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Monitored Domains</h3>
                <p className="text-xs text-zinc-500">Live HTTP, SSL, and DNS checks for this client.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDomainModal(true)}
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Domain
                </button>
                {client.slug && (
                  <Link
                    href={`/status/${client.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Status Page
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </Link>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              {domainsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No domains registered for monitoring.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                    <tr>
                      <th className="steel-metric-label py-3 px-4">Hostname</th>
                      <th className="steel-metric-label py-3 px-4">HTTP Status</th>
                      <th className="steel-metric-label py-3 px-4">SSL Certificate</th>
                      <th className="steel-metric-label py-3 px-4">DNS Resolution</th>
                      <th className="steel-metric-label py-3 px-4">Last Check</th>
                      <th className="steel-metric-label py-3 px-4 text-right">Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {domainsList.map((d) => (
                      <tr key={d.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="py-3 px-4">
                          <div className="font-semibold font-tech text-zinc-900 dark:text-white flex items-center gap-1.5">
                            <span>{d.hostname}</span>
                            <a
                              href={`https://${d.hostname}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-400 hover:text-blue-600 transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {d.status === "up" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> UP
                            </span>
                          ) : d.status === "degraded" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" /> DEGRADED
                            </span>
                          ) : d.status === "down" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <X className="w-3 h-3" /> DOWN
                            </span>
                          ) : (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              <Clock className="w-3 h-3" /> PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {d.sslStatus === "valid" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <ShieldCheck className="w-3 h-3" /> VALID
                            </span>
                          ) : d.sslStatus === "expiring_soon" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" /> EXPIRING
                            </span>
                          ) : d.sslStatus === "expired" || d.sslStatus === "invalid" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <X className="w-3 h-3" /> {d.sslStatus.toUpperCase()}
                            </span>
                          ) : (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              <Clock className="w-3 h-3" /> PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {d.dnsStatus === "healthy" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              HEALTHY
                            </span>
                          ) : d.dnsStatus === "drift_detected" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              DRIFT
                            </span>
                          ) : d.dnsStatus === "resolution_failed" ? (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              FAILED
                            </span>
                          ) : (
                            <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-tech">
                          {d.lastCheckedAt ? formatDate(d.lastCheckedAt) : "Pending Check"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={checkingDomainId === d.id}
                            onClick={() => handleRunDomainCheck(d.id, d.hostname)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/60 dark:border-blue-800/60 transition disabled:opacity-50 cursor-pointer"
                          >
                            {checkingDomainId === d.id ? (
                              <IosSpinner size="xs" className="text-blue-600" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            <span className="font-tech">{checkingDomainId === d.id ? "Probing..." : "Run Diagnostics"}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Credentials Creation Modal */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Client Portal Credentials</h3>
                <p className="text-xs text-zinc-500">Configure portal access for {client.name}</p>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setCredentialMode("direct");
                  if (!credentialsForm.password) {
                    setCredentialsForm((prev) => ({ ...prev, password: generateStrongPassword() }));
                    setShowPassword(true);
                  }
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  credentialMode === "direct"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Set Direct Password
              </button>
              <button
                type="button"
                onClick={() => setCredentialMode("invite")}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  credentialMode === "invite"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email Invite
              </button>
            </div>

            <form onSubmit={handleCreateCredentials} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={credentialsForm.name}
                  onChange={(e) => setCredentialsForm({ ...credentialsForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rahul@client.com"
                  value={credentialsForm.email}
                  onChange={(e) => setCredentialsForm({ ...credentialsForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Portal Role</label>
                <select
                  value={credentialsForm.role}
                  onChange={(e) => setCredentialsForm({ ...credentialsForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="client_admin">Client Admin (Billing, Invoices, Keys, Fleet)</option>
                  <option value="client_member">Client Member (Viewer &amp; Support)</option>
                </select>
              </div>

              {credentialMode === "direct" ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Direct Password *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setCredentialsForm((prev) => ({ ...prev, password: generateStrongPassword() }));
                        setShowPassword(true);
                      }}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      Generate Strong Password
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={credentialsForm.password}
                      onChange={(e) => setCredentialsForm({ ...credentialsForm, password: e.target.value })}
                      placeholder="e.g. RSL-8xK9!mQ2#vL"
                      className="w-full pl-3 pr-10 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                    Password will be immediately available to copy and share upon creation.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>
                    An invitation will be sent to <strong>{credentialsForm.email || "the client email"}</strong> with a one-time setup link and auto-generated temporary password.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCredentialsModal(false)}
                  className="px-3.5 py-2 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  {submitting ? "Processing..." : credentialMode === "direct" ? "Create Credentials Directly" : "Send Email Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Edit Organization Profile</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Organization Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Country *</label>
                  <select
                    value={editFormData.country}
                    onChange={(e) => {
                      const selectedCountry = e.target.value;
                      const cMeta = SUPPORTED_COUNTRIES.find((c) => c.code === selectedCountry);
                      setEditFormData((prev) => ({
                        ...prev,
                        country: selectedCountry,
                        currency: cMeta?.currency || prev.currency,
                        state: selectedCountry === "IN" ? "Karnataka" : "",
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Settlement Currency *</label>
                  <select
                    value={editFormData.currency}
                    onChange={(e) => setEditFormData({ ...editFormData, currency: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                  >
                    {SUPPORTED_CURRENCY_LIST.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) – {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Billing Mode</label>
                  <select
                    value={editFormData.billingMode}
                    onChange={(e) => setEditFormData({ ...editFormData, billingMode: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="non_gst">Non-GST</option>
                    <option value="gst">GST (18%)</option>
                  </select>
                </div>
              </div>

              {/* Tax Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
                    GSTIN {editFormData.billingMode === "gst" ? "*" : "(Optional)"}
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={editFormData.gstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setEditFormData({ ...editFormData, gstin: val });
                      if (val.length === 15) {
                        const res = validateGstin(val, editFormData.state);
                        setEditFormErrors((prev) => ({ ...prev, gstin: res.valid ? undefined : res.error }));
                      } else {
                        setEditFormErrors((prev) => ({ ...prev, gstin: undefined }));
                      }
                    }}
                    placeholder="e.g. 29AAAAA0000A1Z5"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-xs font-mono uppercase focus:ring-2 focus:outline-none ${
                      editFormErrors.gstin
                        ? "border-red-500 focus:ring-red-500"
                        : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                    }`}
                  />
                  {editFormErrors.gstin && (
                    <p className="text-[11px] text-red-500 mt-1">{editFormErrors.gstin}</p>
                  )}
                </div>

                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">PAN (Optional)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={editFormData.pan}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setEditFormData({ ...editFormData, pan: val });
                      if (val.length === 10) {
                        const res = validatePan(val, editFormData.gstin);
                        setEditFormErrors((prev) => ({ ...prev, pan: res.valid ? undefined : res.error }));
                      } else {
                        setEditFormErrors((prev) => ({ ...prev, pan: undefined }));
                      }
                    }}
                    placeholder="e.g. AAAAA0000A"
                    className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-xs font-mono uppercase focus:ring-2 focus:outline-none ${
                      editFormErrors.pan
                        ? "border-red-500 focus:ring-red-500"
                        : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                    }`}
                  />
                  {editFormErrors.pan && (
                    <p className="text-[11px] text-red-500 mt-1">{editFormErrors.pan}</p>
                  )}
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="font-semibold text-zinc-900 dark:text-white">Registered Address</h4>

                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Address Line 1</label>
                  <input
                    type="text"
                    value={editFormData.addressLine1}
                    onChange={(e) => setEditFormData({ ...editFormData, addressLine1: e.target.value })}
                    placeholder="Street address, building, suite"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    value={editFormData.addressLine2}
                    onChange={(e) => setEditFormData({ ...editFormData, addressLine2: e.target.value })}
                    placeholder="Apartment, suite, unit, building, floor"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">State / Province</label>
                    {editFormData.country === "IN" ? (
                      <select
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        {INDIAN_STATES.map((s) => (
                          <option key={s.code} value={s.name}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                        placeholder="State or Region"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">City</label>
                    <input
                      type="text"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      placeholder="e.g. Bengaluru"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">
                      {editFormData.country === "IN" ? "PIN Code (6 digits)" : "Postal Code"}
                    </label>
                    <input
                      type="text"
                      maxLength={editFormData.country === "IN" ? 6 : 12}
                      value={editFormData.postalCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFormData({ ...editFormData, postalCode: val });
                        if (val.trim()) {
                          const res = validatePincode(val, editFormData.country);
                          setEditFormErrors((prev) => ({ ...prev, postalCode: res.valid ? undefined : res.error }));
                        } else {
                          setEditFormErrors((prev) => ({ ...prev, postalCode: undefined }));
                        }
                      }}
                      placeholder={editFormData.country === "IN" ? "560001" : "Zip / Postal"}
                      className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:outline-none ${
                        editFormErrors.postalCode
                          ? "border-red-500 focus:ring-red-500"
                          : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                      }`}
                    />
                    {editFormErrors.postalCode && (
                      <p className="text-[11px] text-red-500 mt-1">{editFormErrors.postalCode}</p>
                    )}
                  </div>
                </div>

                {/* GitHub Repository Mapping */}
                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-semibold text-xs">
                    <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>GitHub Repository &amp; Changelog Sync</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium text-[11px]">
                        Repository (owner/repo)
                      </label>
                      <input
                        type="text"
                        value={editFormData.githubRepo}
                        onChange={(e) => setEditFormData({ ...editFormData, githubRepo: e.target.value.trim() })}
                        placeholder="rapidshift/client-dashboard or owner/repo"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-tech focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium text-[11px]">
                        Default Branch
                      </label>
                      <input
                        type="text"
                        value={editFormData.githubBranch}
                        onChange={(e) => setEditFormData({ ...editFormData, githubBranch: e.target.value.trim() })}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-tech focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Uses the organization GitHub token configured in Admin Settings. Releases, tags, and conventional commits sync into clean feature/fix summaries for the client portal.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold transition inline-flex items-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <IosSpinner size="xs" className="text-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Creation Modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Draft Client Contract</h3>
              </div>
              <button
                onClick={() => setShowContractModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Contract Title / Description *</label>
                <input
                  type="text"
                  required
                  value={contractForm.title}
                  onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Recurring Value ({client.currency || "INR"}) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={contractForm.amountMajor}
                    onChange={(e) => setContractForm({ ...contractForm, amountMajor: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Billing Cycle</label>
                  <select
                    value={contractForm.billingCycle}
                    onChange={(e) => setContractForm({ ...contractForm, billingCycle: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Valid From *</label>
                  <input
                    type="date"
                    required
                    value={contractForm.validFrom}
                    onChange={(e) => setContractForm({ ...contractForm, validFrom: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Valid To *</label>
                  <input
                    type="date"
                    required
                    value={contractForm.validTo}
                    onChange={(e) => setContractForm({ ...contractForm, validTo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowContractModal(false)}
                  className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                >
                  {submitting ? "Drafting..." : "Create Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Generation Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Generate Client Invoice</h3>
              </div>
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Service Line Description *</label>
                <input
                  type="text"
                  required
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Invoice Amount ({client.currency || "INR"}) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={invoiceForm.amountMajor}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, amountMajor: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Payment Due Date *</label>
                  <input
                    type="date"
                    required
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Tax Mode</label>
                  <select
                    value={invoiceForm.billingMode}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, billingMode: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="non_gst">Non-GST</option>
                    <option value="gst">GST (18%)</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invoiceForm.issueImmediately}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, issueImmediately: e.target.checked })}
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Issue immediately to client</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                >
                  {submitting ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Generate Client API Key</h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateApiKey} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Key Description / Name *</label>
                <input
                  type="text"
                  required
                  value={apiKeyForm.name}
                  onChange={(e) => setApiKeyForm({ ...apiKeyForm, name: e.target.value })}
                  placeholder="e.g. Next.js Edge Middleware"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Key Type</label>
                <select
                  value={apiKeyForm.type}
                  onChange={(e) => setApiKeyForm({ ...apiKeyForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="secret">Secret Key (rsk_live_...) — Backend / Proxy only</option>
                  <option value="publishable">Publishable Key (rpk_live_...) — Browser embed</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1.5 font-medium">Scopes</label>
                <div className="grid grid-cols-2 gap-2">
                  {["access:read", "billing:read", "contracts:read", "fleet:read", "monitoring:read", "support:read", "analytics:read"].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={apiKeyForm.scopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setApiKeyForm({ ...apiKeyForm, scopes: [...apiKeyForm.scopes, scope] });
                          } else {
                            setApiKeyForm({ ...apiKeyForm, scopes: apiKeyForm.scopes.filter((s) => s !== scope) });
                          }
                        }}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-[11px]">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                >
                  {submitting ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Domain Monitoring Modal */}
      {showDomainModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Enroll Monitored Domain</h3>
              </div>
              <button
                onClick={() => setShowDomainModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDomain} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Service / App Name *</label>
                <input
                  type="text"
                  required
                  value={domainForm.name}
                  onChange={(e) => setDomainForm({ ...domainForm, name: e.target.value })}
                  placeholder="e.g. Production Web App"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Hostname (FQDN) *</label>
                <input
                  type="text"
                  required
                  value={domainForm.hostname}
                  onChange={(e) => setDomainForm({ ...domainForm, hostname: e.target.value })}
                  placeholder="e.g. app.clientdomain.com"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Port</label>
                <input
                  type="number"
                  value={domainForm.port}
                  onChange={(e) => setDomainForm({ ...domainForm, port: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowDomainModal(false)}
                  className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                >
                  {submitting ? "Enrolling..." : "Enroll Domain"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Gate Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Configure Access Gate</h3>
              </div>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Current Evaluated State:</span>
                <span className="font-bold capitalize">{currentEntitlement?.status || "Active"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Access Permitted:</span>
                <span className={`font-semibold ${currentEntitlement?.allowed ? "text-emerald-600" : "text-red-600"}`}>
                  {currentEntitlement?.allowed ? "Allowed (Pass Issued)" : "Blocked (Redirects to payment-due)"}
                </span>
              </div>
              {currentEntitlement?.manualOverride && (
                <div className="flex justify-between items-center pt-1 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-blue-600 font-semibold">Active Manual Override:</span>
                  <span className="font-mono text-blue-600 font-bold uppercase">{currentEntitlement.manualOverride.mode}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSetOverride} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Override Mode *</label>
                <select
                  value={overrideForm.mode}
                  onChange={(e) => setOverrideForm({ ...overrideForm, mode: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="allow">ALLOW — Force pass (grace period / VIP client)</option>
                  <option value="block">BLOCK — Force block immediate access</option>
                  <option value="maintenance">MAINTENANCE — Display maintenance notice</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Override Note / Reason</label>
                <input
                  type="text"
                  value={overrideForm.note}
                  onChange={(e) => setOverrideForm({ ...overrideForm, note: e.target.value })}
                  placeholder="e.g. Extended payment terms approved until Friday"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-600 dark:text-zinc-400 mb-1 font-medium">Valid Until (Optional)</label>
                <input
                  type="datetime-local"
                  value={overrideForm.validUntil}
                  onChange={(e) => setOverrideForm({ ...overrideForm, validUntil: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {currentEntitlement?.manualOverride ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    disabled={submitting}
                    className="text-red-600 hover:text-red-700 text-xs font-semibold cursor-pointer"
                  >
                    Clear Override
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="px-3.5 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                  >
                    {submitting ? "Saving..." : "Apply Override"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
