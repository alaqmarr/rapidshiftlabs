"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  ArrowLeft,
  Mail,
  FolderKanban,
  X,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Building,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Clock,
  Ban,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import {
  INDIAN_STATES,
  SUPPORTED_COUNTRIES,
  validatePincode,
  validateGstin,
  validatePan,
  formatCurrency,
  getCurrencySymbol,
} from "@/lib/currency";
import { formatDate } from "@/lib/format";

export interface ClientContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface PortalUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: number;
}

export interface ClientItem {
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
  contactsCount: number;
  projectsCount: number;
  contacts: ClientContact[];
  projects: Project[];
  portalUsers?: PortalUserItem[];
  entitlementStatus?: string;
  entitlementAllowed?: boolean;
  entitlementReason?: string;
  overrideMode?: string;
  healthScore?: number;
  healthTier?: "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";
  createdAt: number;
}

interface ClientManagerProps {
  initialClients: ClientItem[];
}

export function ClientManager({ initialClients }: ClientManagerProps) {
  const [clients, setClients] = useState<ClientItem[]>(initialClients);
  const [search, setSearch] = useState("");
  const { showSuccess, showError } = useAlert();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [editingClient, setEditingClient] = useState<ClientItem | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialMode, setCredentialMode] = useState<"direct" | "invite">("direct");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Credentials creation modal form
  const [credentialsForm, setCredentialsForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "client_admin" as "client_admin" | "client_member",
  });

  // Successful credentials display modal
  const [credentialsSuccess, setCredentialsSuccess] = useState<{
    clientName: string;
    name: string;
    email: string;
    password?: string;
    mode: "direct" | "invite";
  } | null>(null);

  // Entitlement override modal state
  const [entitlementClient, setEntitlementClient] = useState<ClientItem | null>(null);
  const [overrideForm, setOverrideForm] = useState({
    mode: "allow" as "allow" | "block" | "maintenance",
    validUntil: "",
    note: "",
  });

  // API Keys modal state
  const [apiKeysClient, setApiKeysClient] = useState<ClientItem | null>(null);
  const [clientApiKeys, setClientApiKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showGenerateKeyModal, setShowGenerateKeyModal] = useState(false);
  const [keyFormData, setKeyFormData] = useState({
    name: "Production Access Gate",
    type: "secret" as "secret" | "publishable",
    scopes: ["access:read"],
  });
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<{
    apiKey: any;
    rawKey: string;
  } | null>(null);

  // Form states for creation
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    gstin: "",
    pan: "",
    billingMode: "non_gst" as "gst" | "non_gst",
    currency: "INR",
    country: "India",
    state: "Karnataka",
    city: "Bengaluru",
    addressLine1: "",
    addressLine2: "",
    postalCode: "560034",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    createPortalCredentials: true,
    credentialMode: "direct" as "direct" | "invite",
    portalPassword: "",
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    name: "",
    slug: "",
    gstin: "",
    pan: "",
    billingMode: "non_gst" as "gst" | "non_gst",
    currency: "INR",
    country: "India",
    state: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    status: "active" as "active" | "inactive" | "suspended",
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const generateStrongPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pwd = "RSL-";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const copyToClipboard = async (text: string, key = "default") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
      showToast("Copied to clipboard!", "success");
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const refreshClients = async () => {
    try {
      const res = await fetch("/api/v1/admin/clients");
      const data = (await res.json()) as { items?: ClientItem[] };
      if (data.items) {
        setClients(data.items);
        if (selectedClient) {
          const updated = data.items.find((c) => c.id === selectedClient.id);
          if (updated) setSelectedClient(updated);
        }
      }
    } catch (err) {
      console.error("Failed to refresh clients:", err);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.postalCode) {
      const pinCheck = validatePincode(formData.postalCode, formData.country);
      if (!pinCheck.isValid) {
        showError("Invalid Postal Code / Pincode", pinCheck.error || "Please enter a valid postal code");
        return;
      }
    }
    if (formData.gstin) {
      const gstinCheck = validateGstin(formData.gstin, formData.state);
      if (!gstinCheck.isValid) {
        showError("Invalid GSTIN", gstinCheck.error || "Please check GSTIN format and state code");
        return;
      }
    }
    if (formData.pan) {
      const panCheck = validatePan(formData.pan, formData.gstin);
      if (!panCheck.isValid) {
        showError("Invalid PAN", panCheck.error || "Please check PAN format");
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = (await res.json()) as {
        client: { id: string; name: string };
        portalUser?: { email: string; name: string; password?: string; tempPassword?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to create client");

      if (formData.createPortalCredentials && formData.contactEmail && formData.contactName) {
        const finalPwd = formData.portalPassword || data.portalUser?.password || data.portalUser?.tempPassword;
        const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login";
        showSuccess(
          "Client Onboarded & Credentials Ready",
          `Client '${data.client.name}' is registered and portal credentials are active.`,
          [
            { label: "Organization", value: data.client.name },
            { label: "Contact Name", value: formData.contactName },
            { label: "Login Email", value: formData.contactEmail, copyable: true },
            ...(finalPwd ? [{ label: "Password", value: finalPwd, copyable: true, isMonospace: true }] : []),
            { label: "Portal URL", value: portalUrl, copyable: true },
          ],
          `RapidShift Labs Client Portal Access\nOrganization: ${data.client.name}\nLogin URL: ${portalUrl}\nEmail: ${formData.contactEmail}${finalPwd ? `\nPassword: ${finalPwd}` : ""}`
        );
      } else {
        showSuccess("Client Onboarded", `Client '${data.client.name}' onboarded successfully.`);
      }

      setShowCreateModal(false);
      setFormData({
        name: "",
        slug: "",
        gstin: "",
        pan: "",
        billingMode: "non_gst",
        currency: "INR",
        country: "India",
        state: "Karnataka",
        city: "Bengaluru",
        addressLine1: "",
        addressLine2: "",
        postalCode: "560034",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        createPortalCredentials: true,
        credentialMode: "direct",
        portalPassword: "",
      });
      await refreshClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create client";
      showError("Onboarding Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (client: ClientItem) => {
    setSelectedClient(null);
    setEditingClient(client);
    setEditFormData({
      name: client.name,
      slug: client.slug,
      gstin: client.gstin || "",
      pan: client.pan || "",
      billingMode: client.billingMode,
      currency: client.currency || "INR",
      country: client.country || "India",
      state: client.state || "Karnataka",
      city: client.city || "Bengaluru",
      addressLine1: client.addressLine1 || "",
      addressLine2: client.addressLine2 || "",
      postalCode: client.postalCode || "",
      status: client.status,
    });
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/clients/${editingClient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update client");

      showSuccess("Client Profile Updated", `Organization details for '${editFormData.name}' were successfully saved.`);
      setEditingClient(null);
      if (selectedClient && selectedClient.id === editingClient.id) {
        setSelectedClient((prev) => (prev ? { ...prev, ...editFormData } : null));
      }
      await refreshClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update client";
      showError("Update Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
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

      const res = await fetch(`/api/v1/admin/clients/${selectedClient.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        user?: { email: string; name: string; password?: string; tempPassword?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to create credentials");

      const finalPassword =
        credentialMode === "direct"
          ? credentialsForm.password || data.user?.password
          : data.user?.password || data.user?.tempPassword;
      const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login";

      setCredentialsSuccess({
        clientName: selectedClient.name,
        email: data.user?.email || credentialsForm.email,
        name: data.user?.name || credentialsForm.name,
        password: finalPassword,
        mode: credentialMode,
      });

      showSuccess(
        credentialMode === "direct" ? "Client Credentials Provisioned" : "Portal Invitation Dispatched",
        credentialMode === "direct"
          ? `Direct credentials generated for ${credentialsForm.name} (${credentialsForm.email}). Copy and securely share them below.`
          : `An invitation email with access details has been dispatched to ${credentialsForm.email}.`,
        [
          { label: "Organization", value: selectedClient.name },
          { label: "User Name", value: credentialsForm.name },
          { label: "Login Email", value: credentialsForm.email, copyable: true },
          ...(finalPassword ? [{ label: "Password", value: finalPassword, copyable: true, isMonospace: true }] : []),
          { label: "Portal Login URL", value: portalUrl, copyable: true },
        ],
        `RapidShift Labs Client Portal Access\nClient: ${selectedClient.name}\nName: ${credentialsForm.name}\nEmail: ${credentialsForm.email}${finalPassword ? `\nPassword: ${finalPassword}` : ""}\nLogin URL: ${portalUrl}`
      );

      setShowCredentialsModal(false);
      setCredentialsForm({ name: "", email: "", password: "", role: "client_admin" });
      await refreshClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create credentials";
      showError("Credential Creation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const loadClientApiKeys = async (clientId: string) => {
    try {
      setLoadingKeys(true);
      const res = await fetch(`/api/v1/admin/api-keys?clientId=${clientId}`);
      const data = (await res.json()) as { items?: any[] };
      if (data.items) {
        setClientApiKeys(data.items);
      }
    } catch (err) {
      console.error("Failed to load client keys:", err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleOpenApiKeys = async (client: ClientItem) => {
    setApiKeysClient(client);
    await loadClientApiKeys(client.id);
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeysClient) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: apiKeysClient.id,
          name: keyFormData.name,
          type: keyFormData.type,
          scopes: keyFormData.scopes,
        }),
      });
      const data = (await res.json()) as { apiKey: any; rawKey: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to generate API key");
      setNewlyGeneratedKey(data);
      setShowGenerateKeyModal(false);
      showSuccess(
        "API Key Generated",
        `New API key '${keyFormData.name}' for ${apiKeysClient.name} is ready.`,
        [
          { label: "Key Name", value: keyFormData.name },
          { label: "Key Prefix", value: data.apiKey?.keyPrefix || "rsk_live_..." },
          { label: "Raw Secret Key", value: data.rawKey, copyable: true, isMonospace: true },
        ],
        data.rawKey
      );
      await loadClientApiKeys(apiKeysClient.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate key";
      showError("Key Generation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action is permanent and immediate.")) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to revoke API key");
      showSuccess("API Key Revoked", "The key was permanently deactivated.");
      if (apiKeysClient) {
        await loadClientApiKeys(apiKeysClient.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke key";
      showError("Key Revocation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEntitlement = (client: ClientItem) => {
    setEntitlementClient(client);
    setOverrideForm({
      mode: (client.overrideMode as any) || "allow",
      validUntil: "",
      note: client.entitlementReason || "",
    });
  };

  const handleSetOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entitlementClient) return;
    try {
      setSubmitting(true);
      const validUntilTs = overrideForm.validUntil ? new Date(overrideForm.validUntil).getTime() : null;
      const res = await fetch(`/api/v1/admin/entitlements/${entitlementClient.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: overrideForm.mode,
          validUntil: validUntilTs,
          note: overrideForm.note,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to set override");
      showSuccess("Gate Override Set", `Entitlement override '${overrideForm.mode}' applied for ${entitlementClient.name}.`);
      setEntitlementClient(null);
      await refreshClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to apply override";
      showError("Override Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearOverride = async () => {
    if (!entitlementClient) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/entitlements/${entitlementClient.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to clear override");
      showSuccess("Override Cleared", `Manual gate override removed for ${entitlementClient.name}.`);
      setEntitlementClient(null);
      await refreshClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clear override";
      showError("Clear Override Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter clients locally
  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || (c.gstin && c.gstin.toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Page Title & Metrics Header */}
      <div className="border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xs">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-600/20 ring-1 ring-white/20 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
                  Clients &amp; Organizations
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Tenant registry, contracts overview, access gate enforcement, and client portal credentials.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition cursor-pointer"
                data-testid="new-client-btn"
              >
                <Plus className="w-4 h-4" />
                <span>Onboard Client</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Total Tenants</span>
              <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">{clients.length}</div>
            </div>
            <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Active Status</span>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                {clients.filter((c) => c.status === "active").length}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">GST Compliant</span>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                {clients.filter((c) => c.billingMode === "gst").length}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Gate Issues</span>
              <div className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
                {clients.filter((c) => c.entitlementAllowed === false).length}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Health Alert</span>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {clients.filter((c) => (c.healthScore ?? 100) < 70).length} At Risk
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 flex-1">
        {/* Search Bar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search clients by name, slug or GSTIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="search-clients-input"
            />
          </div>
          <span className="text-xs text-zinc-500">
            Showing {filteredClients.length} of {clients.length} organizations
          </span>
        </div>

        {/* Clients Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm" data-testid="clients-table">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Organization</th>
                  <th className="py-3.5 px-6">Health Index</th>
                  <th className="py-3.5 px-6">Billing Mode</th>
                  <th className="py-3.5 px-6">Location</th>
                  <th className="py-3.5 px-6">Contacts / Projects</th>
                  <th className="py-3.5 px-6">Gate / Entitlement</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      No clients found. Click &quot;New Client&quot; to onboard an organization.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition cursor-pointer"
                      onClick={() => setSelectedClient(client)}
                      data-testid={`client-row-${client.id}`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center font-bold text-xs text-blue-700 dark:text-blue-300 shrink-0 shadow-2xs">
                            {client.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/admin/clients/${client.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition"
                            >
                              {client.name}
                            </Link>
                            <div className="text-xs text-zinc-400 font-mono mt-0.5">{client.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              (client.healthScore ?? 100) >= 85
                                ? "bg-emerald-500"
                                : (client.healthScore ?? 100) >= 70
                                ? "bg-blue-500"
                                : (client.healthScore ?? 100) >= 50
                                ? "bg-amber-500 animate-pulse"
                                : "bg-red-500 animate-ping"
                            }`}
                          />
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 font-mono">
                            {client.healthScore ?? 100}%
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold tracking-wider uppercase ${
                              client.healthTier === "EXCELLENT" || !client.healthTier
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                                : client.healthTier === "GOOD"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60"
                                : client.healthTier === "AT_RISK"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60"
                                : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/60 dark:border-red-800/60"
                            }`}
                          >
                            {client.healthTier || "EXCELLENT"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${
                            client.billingMode === "gst"
                              ? "bg-blue-100/80 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                          }`}
                        >
                          {client.billingMode === "gst" ? "GST Billed" : "Non-GST"}
                        </span>
                        {client.gstin && <div className="text-[11px] text-zinc-400 font-mono mt-1">{client.gstin}</div>}
                      </td>
                      <td className="py-4 px-6 text-zinc-600 dark:text-zinc-400 text-xs">
                        {client.city && client.state ? `${client.city}, ${client.state}` : client.state || "India"}
                      </td>
                      <td className="py-4 px-6 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                            <Mail className="w-3.5 h-3.5 text-zinc-400" />
                            {client.contactsCount} contact(s)
                          </span>
                          <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                            <FolderKanban className="w-3.5 h-3.5 text-zinc-400" />
                            {client.projectsCount} project(s)
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              client.entitlementStatus === "Active" || (!client.entitlementStatus && client.status === "active")
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                : client.entitlementStatus === "Overdue"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                                  : client.entitlementStatus === "Suspended"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                                    : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                            }`}
                            data-testid={`entitlement-badge-${client.id}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                client.entitlementAllowed !== false ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                              }`}
                            />
                            {client.entitlementStatus || "Active"}
                          </span>
                          {client.overrideMode && (
                            <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              Override: {client.overrideMode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            client.status === "active"
                              ? "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-red-100/70 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${client.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                          {client.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition"
                            title="Open Dedicated Full Page Workspace"
                            data-testid={`workspace-link-${client.id}`}
                          >
                            <span>Workspace</span>
                            <ExternalLink className="w-3 h-3 opacity-80" />
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedClient(client);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                            title="Quick Drawer View"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Drawer</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEntitlement(client);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                            title="Entitlement Override"
                            data-testid={`override-btn-${client.id}`}
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Gate</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenApiKeys(client);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                            title="API Keys"
                            data-testid={`api-keys-btn-${client.id}`}
                          >
                            <Key className="w-3.5 h-3.5 text-zinc-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(client);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
                            title="Edit Client"
                            data-testid={`edit-client-${client.id}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Create Client Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <h3 className="font-semibold text-lg">Onboard New Client</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Legal Organization Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Innovations Pvt Ltd"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="create-client-name"
                />
              </div>

              {/* Country and Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Country *
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => {
                      const newCountry = e.target.value;
                      const found = SUPPORTED_COUNTRIES.find((c) => c.name === newCountry);
                      setFormData({
                        ...formData,
                        country: newCountry,
                        currency: found?.currency || formData.currency,
                        state: newCountry === "India" ? "Karnataka" : "",
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="create-client-country"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Settlement Currency *
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="create-client-currency"
                  >
                    <option value="INR">INR (₹) - Indian Rupee</option>
                    <option value="USD">USD ($) - US Dollar</option>
                    <option value="EUR">EUR (€) - Euro</option>
                    <option value="GBP">GBP (£) - British Pound</option>
                    <option value="AED">AED - UAE Dirham</option>
                    <option value="SGD">SGD (S$) - Singapore Dollar</option>
                    <option value="CAD">CAD (CA$) - Canadian Dollar</option>
                    <option value="AUD">AUD (A$) - Australian Dollar</option>
                    <option value="JPY">JPY (¥) - Japanese Yen</option>
                  </select>
                </div>
              </div>

              {/* Billing Mode & PAN */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Billing Mode
                  </label>
                  <select
                    value={formData.billingMode}
                    onChange={(e) => setFormData({ ...formData, billingMode: e.target.value as "non_gst" | "gst" })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="non_gst">Non-GST (Zero Tax / Export)</option>
                    <option value="gst">GST (18% - Intra/Inter-state)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Permanent Account Number (PAN)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    value={formData.pan}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  />
                </div>
              </div>

              {/* GSTIN & State */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    GSTIN {formData.billingMode === "gst" ? "*" : "(Optional)"}
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="29ABCDE1234F1Z5"
                    value={formData.gstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setFormData({ ...formData, gstin: val });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  />
                  {formData.gstin && formData.gstin.length === 15 && (
                    <p className="text-[10px] text-zinc-400 mt-1">State Code: {formData.gstin.slice(0, 2)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    State / Province *
                  </label>
                  {formData.country.toLowerCase() === "india" ? (
                    <select
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      placeholder="e.g. California, Dubai, Ontario"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              </div>

              {/* City and Pincode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengaluru"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    {formData.country.toLowerCase() === "india" ? "PIN Code (6-digit) *" : "Postal Code *"}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={formData.country.toLowerCase() === "india" ? 6 : 10}
                    placeholder={formData.country.toLowerCase() === "india" ? "560034" : "94016"}
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    data-testid="create-client-pincode"
                  />
                </div>
              </div>

              {/* Street Address */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Street Address Line 1
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 42 Tech Park, 80 Feet Road"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Street Address Line 2
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Suite 500, Block B"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Primary Contact</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Contact Name</label>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Email</label>
                    <input
                      type="email"
                      placeholder="jane@client.com"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Portal Credentials Creation */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={formData.createPortalCredentials}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          createPortalCredentials: checked,
                          portalPassword: checked && !formData.portalPassword ? generateStrongPassword() : formData.portalPassword,
                        });
                      }}
                      className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Provision Client Portal Login Access</span>
                  </label>
                  <span className="text-[10px] text-zinc-400">Client Admin</span>
                </div>

                {formData.createPortalCredentials && (
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700/60 space-y-3 mt-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            credentialMode: "direct",
                            portalPassword: formData.portalPassword || generateStrongPassword(),
                          });
                        }}
                        className={`py-1.5 px-2 rounded-md font-medium text-xs flex items-center justify-center gap-1.5 border transition ${
                          formData.credentialMode === "direct"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        <Key className="w-3.5 h-3.5" />
                        Set Password Directly
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, credentialMode: "invite" })}
                        className={`py-1.5 px-2 rounded-md font-medium text-xs flex items-center justify-center gap-1.5 border transition ${
                          formData.credentialMode === "invite"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Send Invite Email
                      </button>
                    </div>

                    {formData.credentialMode === "direct" ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">Initial Password</label>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, portalPassword: generateStrongPassword() })}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                            Regenerate
                          </button>
                        </div>
                        <input
                          type="text"
                          required={formData.createPortalCredentials}
                          value={formData.portalPassword}
                          onChange={(e) => setFormData({ ...formData, portalPassword: e.target.value })}
                          placeholder="e.g. RSL-8xK9!mQ2#vL"
                          className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Password will be displayed immediately after onboarding so you can copy and share it.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        An invitation with an auto-generated temporary password will be sent to the primary contact email upon creation.
                      </p>
                    )}
                  </div>
                )}
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
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
                  data-testid="submit-create-client"
                >
                  {submitting ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-lg">Edit Client Organization</h3>
              </div>
              <button
                onClick={() => setEditingClient(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleUpdateClient} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Legal Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="edit-client-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Slug</label>
                  <input
                    type="text"
                    value={editFormData.slug}
                    onChange={(e) => setEditFormData({ ...editFormData, slug: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as "active" | "inactive" | "suspended" })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Billing Mode</label>
                  <select
                    value={editFormData.billingMode}
                    onChange={(e) => setEditFormData({ ...editFormData, billingMode: e.target.value as "gst" | "non_gst" })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="non_gst">Non-GST</option>
                    <option value="gst">GST (18%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editFormData.gstin}
                    onChange={(e) => setEditFormData({ ...editFormData, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">City</label>
                  <input
                    type="text"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">State</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer inline-flex items-center gap-2"
                  data-testid="submit-edit-client"
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

      {/* Client Details Drawer */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-end">
          <div className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md h-full overflow-y-auto p-6 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="font-bold text-lg">{selectedClient.name}</h3>
                <p className="text-xs font-mono text-zinc-500">{selectedClient.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/clients/${selectedClient.id}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 transition"
                  title="Open dedicated workspace page"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Full Page</span>
                </Link>
                <button
                  onClick={() => handleOpenEdit(selectedClient)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  title="Edit details"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-6 flex-1 text-sm">
              {/* Overview */}
              <div>
                <h4 className="text-xs font-semibold uppercase text-zinc-400 mb-2">Details</h4>
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-lg space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Billing Mode:</span>
                    <span className="font-medium uppercase">{selectedClient.billingMode}</span>
                  </div>
                  {selectedClient.gstin && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">GSTIN:</span>
                      <span className="font-mono">{selectedClient.gstin}</span>
                    </div>
                  )}
                  {selectedClient.pan && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">PAN:</span>
                      <span className="font-mono">{selectedClient.pan}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">State:</span>
                    <span>{selectedClient.state || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status:</span>
                    <span className="capitalize font-medium">{selectedClient.status}</span>
                  </div>
                </div>
              </div>

              {/* Contacts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase text-zinc-400">Contacts</h4>
                </div>
                {selectedClient.contacts.length === 0 ? (
                  <p className="text-xs text-zinc-400">No contacts registered.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedClient.contacts.map((c) => (
                      <div key={c.id} className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                        <div className="font-medium flex items-center justify-between">
                          {c.name}
                          {c.isPrimary && (
                            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.2 rounded text-[10px]">
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-zinc-500 mt-0.5">{c.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Portal Accounts & Credentials Section */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase text-zinc-400">Portal Accounts &amp; Access</h4>
                  <span className="text-[10px] text-zinc-400">
                    {(selectedClient.portalUsers || []).length} registered
                  </span>
                </div>

                {(selectedClient.portalUsers || []).length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-center">
                    No portal login accounts created yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedClient.portalUsers?.map((u) => (
                      <div key={u.id} className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/30">
                        <div>
                          <div className="font-medium flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
                            <Key className="w-3.5 h-3.5 text-indigo-500" />
                            {u.name}
                            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-1.5 py-0.2 rounded text-[10px] font-mono">
                              {u.role === "client_admin" ? "Admin" : "Member"}
                            </span>
                          </div>
                          <div className="text-zinc-500 mt-0.5 font-mono text-[11px]">{u.email}</div>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                          {u.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct Credentials vs Send Invite Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <button
                    onClick={() => {
                      setCredentialMode("direct");
                      const primaryContact = selectedClient.contacts.find((c) => c.isPrimary) || selectedClient.contacts[0];
                      setCredentialsForm({
                        name: primaryContact?.name || "",
                        email: primaryContact?.email || "",
                        password: generateStrongPassword(),
                        role: "client_admin",
                      });
                      setShowPassword(true);
                      setShowCredentialsModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer shadow-sm"
                    data-testid="create-credentials-direct-btn"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Create Credentials
                  </button>

                  <button
                    onClick={() => {
                      setCredentialMode("invite");
                      const primaryContact = selectedClient.contacts.find((c) => c.isPrimary) || selectedClient.contacts[0];
                      setCredentialsForm({
                        name: primaryContact?.name || "",
                        email: primaryContact?.email || "",
                        password: "",
                        role: "client_admin",
                      });
                      setShowCredentialsModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 py-2 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer"
                    data-testid="send-invite-btn"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Send Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Credentials / Invite Modal */}
      {showCredentialsModal && selectedClient && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-4">
              <div>
                <h3 className="font-semibold text-base">Client Portal Credentials</h3>
                <p className="text-xs text-zinc-500">Provide portal access for {selectedClient.name}</p>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setCredentialMode("direct");
                  if (!credentialsForm.password) {
                    setCredentialsForm((prev) => ({ ...prev, password: generateStrongPassword() }));
                    setShowPassword(true);
                  }
                }}
                className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  credentialMode === "direct"
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Set Direct Password
              </button>
              <button
                type="button"
                onClick={() => setCredentialMode("invite")}
                className={`py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  credentialMode === "invite"
                    ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email Invite
              </button>
            </div>

            <form onSubmit={handleCreateCredentials} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={credentialsForm.name}
                  onChange={(e) => setCredentialsForm({ ...credentialsForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Portal Role</label>
                <select
                  value={credentialsForm.role}
                  onChange={(e) => setCredentialsForm({ ...credentialsForm, role: e.target.value as "client_admin" | "client_member" })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
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
                      className="w-full pl-3 pr-10 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    You can copy and share these credentials immediately after clicking create.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>
                    An invitation will be sent to <strong>{credentialsForm.email || "the client's email"}</strong> with a one-time setup link and auto-generated temporary password.
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
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  data-testid="submit-credentials"
                >
                  {submitting ? (
                    "Processing..."
                  ) : credentialMode === "direct" ? (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      Create Credentials Directly
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Email Invite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Credentials Display Modal */}
      {credentialsSuccess && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  {credentialsSuccess.mode === "direct" ? "Client Credentials Created" : "Client Invite Dispatched"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {credentialsSuccess.clientName} portal account ready
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Portal Login URL:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-medium">/portal/login</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login", "url")}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    title="Copy URL"
                  >
                    {copiedKey === "url" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Email:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-medium">{credentialsSuccess.email}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentialsSuccess.email, "email")}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    title="Copy Email"
                  >
                    {copiedKey === "email" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {credentialsSuccess.password && (
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-zinc-500 font-semibold text-indigo-600 dark:text-indigo-400">Password:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded text-zinc-900 dark:text-zinc-100 font-bold">
                      {credentialsSuccess.password}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(credentialsSuccess.password || "", "pwd")}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      title="Copy Password"
                    >
                      {copiedKey === "pwd" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login";
                  const payload = `RapidShift Labs Client Portal Access\nOrganization: ${credentialsSuccess.clientName}\nLogin URL: ${url}\nEmail: ${credentialsSuccess.email}${credentialsSuccess.password ? `\nPassword: ${credentialsSuccess.password}` : ""}`;
                  copyToClipboard(payload, "all");
                }}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {copiedKey === "all" ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                Copy Full Login Details
              </button>

              <button
                type="button"
                onClick={() => setCredentialsSuccess(null)}
                className="w-full py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Entitlement Override Modal */}
      {entitlementClient && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-base">Entitlement &amp; Access Gate Override</h3>
                  <p className="text-xs text-zinc-500 font-mono">{entitlementClient.name} ({entitlementClient.id})</p>
                </div>
              </div>
              <button
                onClick={() => setEntitlementClient(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Status Overview */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Current Gate Status:</span>
                <span className="font-semibold uppercase px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100">
                  {entitlementClient.entitlementStatus || "Active"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Access Permitted:</span>
                <span className={`font-semibold ${entitlementClient.entitlementAllowed !== false ? "text-emerald-600" : "text-red-600"}`}>
                  {entitlementClient.entitlementAllowed !== false ? "Allowed (Pass Issued)" : "Blocked (Redirects to payment-due)"}
                </span>
              </div>
              {entitlementClient.entitlementReason && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Evaluation Reason:</span>
                  <span className="text-zinc-700 dark:text-zinc-300 italic">{entitlementClient.entitlementReason}</span>
                </div>
              )}
              {entitlementClient.overrideMode && (
                <div className="flex justify-between items-center pt-1 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-blue-600 font-medium">Active Override:</span>
                  <span className="font-mono text-blue-600 font-bold uppercase">{entitlementClient.overrideMode}</span>
                </div>
              )}
            </div>

            {/* Override Controls Form */}
            <form onSubmit={handleSetOverride} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Override Mode *
                </label>
                <select
                  value={overrideForm.mode}
                  onChange={(e) => setOverrideForm({ ...overrideForm, mode: e.target.value as "allow" | "block" | "maintenance" })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="override-mode-select"
                >
                  <option value="allow">Force Allow (Bypass overdue billing rules)</option>
                  <option value="block">Force Block (Immediate administrative lockout)</option>
                  <option value="maintenance">Maintenance Mode (Temporary access pause)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Valid Until (Optional - leave blank for indefinite)
                </label>
                <input
                  type="datetime-local"
                  value={overrideForm.validUntil}
                  onChange={(e) => setOverrideForm({ ...overrideForm, validUntil: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="override-valid-until"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Override Audit Note / Reason
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Granted 7-day grace extension per customer request"
                  value={overrideForm.note}
                  onChange={(e) => setOverrideForm({ ...overrideForm, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="override-note"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                {entitlementClient.overrideMode ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    disabled={submitting}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center gap-1.5 cursor-pointer"
                    data-testid="clear-override-btn"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Clear Active Override
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEntitlementClient(null)}
                    className="px-3.5 py-2 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                    data-testid="submit-override-btn"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    {submitting ? "Applying..." : "Apply Override"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Keys Management Modal */}
      {apiKeysClient && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">API Keys &amp; Gateway Credentials</h3>
                  <p className="text-xs text-zinc-500 font-mono">{apiKeysClient.name} ({apiKeysClient.id})</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGenerateKeyModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm cursor-pointer"
                  data-testid="generate-key-btn"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Generate New Key
                </button>
                <button
                  onClick={() => setApiKeysClient(null)}
                  className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loadingKeys ? (
              <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                <IosSpinner size="sm" className="text-indigo-500" />
                <span>Loading client credentials...</span>
              </div>
            ) : clientApiKeys.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                <Key className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
                <p>No API keys generated for this client yet.</p>
                <p className="text-[11px] text-zinc-500 mt-1">Click &quot;Generate New Key&quot; to create a secret or publishable key.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
                {clientApiKeys.map((k) => (
                  <div key={k.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{k.name}</span>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">
                          {k.keyPrefix}...
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          {k.type}
                        </span>
                        {k.revokedAt ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                            Revoked
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                        <span>Scopes: {k.scopes?.join(", ") || "access:read"}</span>
                        <span>&bull;</span>
                        <span>Created: {formatDate(k.createdAt)}</span>
                        {k.lastUsedAt && (
                          <>
                            <span>&bull;</span>
                            <span>Last used: {formatDate(k.lastUsedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {!k.revokedAt && (
                      <button
                        onClick={() => handleRevokeApiKey(k.id)}
                        disabled={submitting}
                        className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition cursor-pointer"
                        title="Revoke Key"
                        data-testid={`revoke-key-${k.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate API Key Modal */}
      {showGenerateKeyModal && apiKeysClient && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-semibold text-base">Generate New API Key</h3>
              <button
                onClick={() => setShowGenerateKeyModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateApiKey} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Key Description / Name *</label>
                <input
                  type="text"
                  required
                  value={keyFormData.name}
                  onChange={(e) => setKeyFormData({ ...keyFormData, name: e.target.value })}
                  placeholder="e.g. Next.js Edge Middleware"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="key-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Key Type</label>
                <select
                  value={keyFormData.type}
                  onChange={(e) => setKeyFormData({ ...keyFormData, type: e.target.value as "secret" | "publishable" })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="secret">Secret Key (rsk_live_...) - Server / Proxy only</option>
                  <option value="publishable">Publishable Key (rpk_live_...) - Browser client</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">Permitted Scopes</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["access:read", "billing:read", "contracts:read", "fleet:read", "monitoring:read", "support:read", "analytics:read"].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                      <input
                        type="checkbox"
                        checked={keyFormData.scopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setKeyFormData({ ...keyFormData, scopes: [...keyFormData.scopes, scope] });
                          } else {
                            setKeyFormData({ ...keyFormData, scopes: keyFormData.scopes.filter((s) => s !== scope) });
                          }
                        }}
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-mono text-[11px]">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateKeyModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                  data-testid="submit-generate-key"
                >
                  {submitting ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Newly Generated Secret Key One-Time Display Modal */}
      {newlyGeneratedKey && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">API Key Generated</h3>
                <p className="text-xs text-zinc-500">Copy this secret key now. It will never be shown again.</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-200">
              RapidShift stores only a cryptographic SHA-256 hash. If you lose this key, you will have to generate a new one.
            </div>

            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold break-all text-zinc-900 dark:text-zinc-100 select-all" data-testid="raw-key-value">
                {newlyGeneratedKey.rawKey}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(newlyGeneratedKey.rawKey, "rawKey")}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0"
                title="Copy Key"
                data-testid="copy-raw-key-btn"
              >
                {copiedKey === "rawKey" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setNewlyGeneratedKey(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
              >
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instant Feedback Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm animate-in slide-in-from-bottom-2 fade-in duration-200"
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          )}
          <span className="font-medium text-xs">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
