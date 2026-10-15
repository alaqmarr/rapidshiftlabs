"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Settings,
  ArrowLeft,
  Building2,
  Mail,
  Hash,
  Save,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  CreditCard,
  MapPin,
  GitBranch,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import {
  INDIAN_STATES,
  validatePincode,
  validateGstin,
  validatePan,
} from "@/lib/currency";

export interface SettingsData {
  company: {
    legalName: string;
    tradeName?: string;
    gstin?: string;
    pan?: string;
    state?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    country: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    branch?: string;
    upiId?: string;
    swiftBic?: string;
    iban?: string;
    lutNumber?: string;
    phone?: string;
    email?: string;
  };
  email: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
  };
  numbering: {
    gstPrefix: string;
    nonGstPrefix: string;
    nextGstSequence: number;
    nextNonGstSequence: number;
  };
  github?: {
    token?: string;
    hasToken?: boolean;
    tokenPreview?: string;
    defaultBranch?: string;
    configuredAt?: number;
    lastTestedAt?: number;
    lastTestStatus?: "ok" | "error";
    lastTestMessage?: string;
    rateLimitRemaining?: number;
  };
}

interface SettingsManagerProps {
  initialSettings: SettingsData;
}

export function SettingsManager({ initialSettings }: SettingsManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [activeTab, setActiveTab] = useState<"company" | "email" | "numbering" | "github">("company");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showGitHubToken, setShowGitHubToken] = useState(false);

  // Test Email state
  const [testEmailTarget, setTestEmailTarget] = useState(initialSettings.company.email || "");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // GitHub Test state
  const [testingGitHub, setTestingGitHub] = useState(false);
  const [gitHubTestResult, setGitHubTestResult] = useState<{
    ok: boolean;
    message: string;
    login?: string;
    rateLimitRemaining?: number;
  } | null>(
    initialSettings.github?.lastTestStatus
      ? {
          ok: initialSettings.github.lastTestStatus === "ok",
          message: initialSettings.github.lastTestMessage || "Previous test recorded",
          rateLimitRemaining: initialSettings.github.rateLimitRemaining,
        }
      : null,
  );

  const [settings, setSettings] = useState<SettingsData>({
    ...initialSettings,
    github: {
      token: "",
      defaultBranch: initialSettings.github?.defaultBranch || "main",
      hasToken: initialSettings.github?.hasToken || false,
      tokenPreview: initialSettings.github?.tokenPreview,
      ...initialSettings.github,
    },
  });
  const [validationErrors, setValidationErrors] = useState<{
    gstin?: string;
    pan?: string;
    postalCode?: string;
  }>({});

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { gstin?: string; pan?: string; postalCode?: string } = {};

    if (settings.company.postalCode?.trim()) {
      const pinRes = validatePincode(settings.company.postalCode, settings.company.country || "IN");
      if (!pinRes.valid) {
        errors.postalCode = pinRes.error;
      }
    }

    if (settings.company.gstin?.trim()) {
      const gstRes = validateGstin(settings.company.gstin, settings.company.state);
      if (!gstRes.valid) {
        errors.gstin = gstRes.error;
      }
    }

    if (settings.company.pan?.trim()) {
      const panRes = validatePan(settings.company.pan, settings.company.gstin);
      if (!panRes.valid) {
        errors.pan = panRes.error;
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      showError("Validation Error", "Please correct the tax/address validation errors before saving.");
      return;
    }

    setValidationErrors({});

    try {
      setSaving(true);
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error || "Failed to save settings");
      }

      showSuccess(
        "Control Panel Settings Saved",
        `Configuration settings have been securely committed to the database. All billing generators, invoice sequences, and SMTP transports will use these updated values immediately.`,
        [
          { label: "Company Legal Name", value: settings.company.legalName },
          { label: "GSTIN", value: settings.company.gstin || "Not Configured" },
          { label: "SMTP Host", value: `${settings.email.host}:${settings.email.port}` },
          { label: "From Sender", value: `${settings.email.fromName} <${settings.email.fromEmail}>` },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      showError("Save Settings Failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTarget || !testEmailTarget.includes("@")) {
      showError("Invalid Email", "Please enter a valid recipient email address for SMTP testing.");
      return;
    }

    try {
      setSendingTestEmail(true);
      setTestEmailResult(null);
      const res = await fetch("/api/v1/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmail: testEmailTarget }),
      });

      const data = (await res.json()) as { error?: string; messageId?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to send test email");
      }

      setTestEmailResult({
        success: true,
        message: `Test email dispatched successfully! Message ID: ${data.messageId || "ok"}`,
      });
      showSuccess(
        "SMTP Transport Verified",
        `Test message successfully relayed through ${settings.email.host}:${settings.email.port}. Inbound inbox check recommended.`,
        [
          { label: "Recipient", value: testEmailTarget },
          { label: "SMTP Host", value: `${settings.email.host}:${settings.email.port}` },
          { label: "Message ID", value: data.messageId || "ok", copyable: true },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect to SMTP server";
      setTestEmailResult({
        success: false,
        message: msg,
      });
      showError("SMTP Delivery Failed", msg, [
        { label: "Target Email", value: testEmailTarget },
        { label: "Configured Host", value: settings.email.host },
      ]);
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleTestGitHubConnection = async () => {
    try {
      setTestingGitHub(true);
      setGitHubTestResult(null);

      const tokenToSend = settings.github?.token?.trim() || "";

      const res = await fetch("/api/v1/admin/settings/test-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToSend }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        login?: string;
        rateLimitRemaining?: number;
      };

      setGitHubTestResult(data);

      if (data.ok) {
        showSuccess(
          "GitHub Integration Verified",
          data.message,
          [
            { label: "Account", value: `@${data.login || "user"}` },
            {
              label: "Rate Limit Remaining",
              value: `${data.rateLimitRemaining ?? 5000} req/hr`,
            },
          ],
        );
      } else {
        showError("GitHub Verification Failed", data.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to verify GitHub connection";
      setGitHubTestResult({ ok: false, message: msg });
      showError("GitHub Error", msg);
    } finally {
      setTestingGitHub(false);
    }
  };

  // Preview formatting
  const currentYear = new Date().getFullYear();
  const nextYearShort = String((currentYear + 1) % 100).padStart(2, "0");
  const fyString = `${currentYear}-${nextYearShort}`;
  const gstPreview = `${settings.numbering.gstPrefix}/${fyString}/${String(
    settings.numbering.nextGstSequence,
  ).padStart(4, "0")}`;
  const nonGstPreview = `${settings.numbering.nonGstPrefix}/${fyString}/${String(
    settings.numbering.nextNonGstSequence,
  ).padStart(4, "0")}`;

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
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                System Settings &amp; Configuration
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Manage company legal entity, GSTIN, SMTP email delivery, and invoice numbering
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
            data-testid="save-settings-btn"
          >
            {saving ? (
              <>
                <IosSpinner size="sm" className="text-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Changes</span>
              </>
            )}
          </button>
        </div>
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <button
            onClick={() => setActiveTab("company")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "company"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            data-testid="tab-company"
          >
            <Building2 className="w-4 h-4" />
            <span>Company & Tax Profile</span>
          </button>

          <button
            onClick={() => setActiveTab("email")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "email"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            data-testid="tab-email"
          >
            <Mail className="w-4 h-4" />
            <span>Email & SMTP</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("numbering")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "numbering"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            data-testid="tab-numbering"
          >
            <Hash className="w-4 h-4" />
            <span>Invoice Numbering</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("github")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "github"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            data-testid="tab-github"
          >
            <GitBranch className="w-4 h-4" />
            <span>GitHub Integration</span>
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* TAB 1: COMPANY & TAX PROFILE */}
          {activeTab === "company" && (
            <div className="space-y-6">
              {/* Legal Entity */}
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                    Legal Entity & Brand Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Legal Business Name
                    </label>
                    <input
                      type="text"
                      value={settings.company.legalName}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, legalName: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      data-testid="input-company-legal-name"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Trade / Brand Name
                    </label>
                    <input
                      type="text"
                      value={settings.company.tradeName || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, tradeName: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid="input-company-trade-name"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Billing & Inquiries Email
                    </label>
                    <input
                      type="email"
                      value={settings.company.email || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, email: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid="input-company-email"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      value={settings.company.phone || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, phone: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid="input-company-phone"
                    />
                  </div>
                </div>
              </div>

              {/* Tax & GST Profile */}
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      Tax & GST Configuration
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Required for GST compliant invoices and intra/inter-state IGST calculation
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      GSTIN (15-digit)
                    </label>
                    <input
                      type="text"
                      value={settings.company.gstin || ""}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, gstin: val },
                        }));
                        if (val.length === 15) {
                          const res = validateGstin(val, settings.company.state);
                          setValidationErrors((prev) => ({ ...prev, gstin: res.valid ? undefined : res.error }));
                        } else {
                          setValidationErrors((prev) => ({ ...prev, gstin: undefined }));
                        }
                      }}
                      maxLength={15}
                      placeholder="29AAAAA0000A1Z5"
                      className={`w-full text-xs rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 font-tech tabular-nums ${
                        validationErrors.gstin
                          ? "border-red-500 focus:ring-red-500"
                          : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                      }`}
                      data-testid="input-company-gstin"
                    />
                    {validationErrors.gstin ? (
                      <p className="text-[10px] text-red-500 mt-1">{validationErrors.gstin}</p>
                    ) : (
                      <p className="text-[10px] text-zinc-400 mt-1">
                        First 2 digits determine your home tax state
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Permanent Account Number (PAN)
                    </label>
                    <input
                      type="text"
                      value={settings.company.pan || ""}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, pan: val },
                        }));
                        if (val.length === 10) {
                          const res = validatePan(val, settings.company.gstin);
                          setValidationErrors((prev) => ({ ...prev, pan: res.valid ? undefined : res.error }));
                        } else {
                          setValidationErrors((prev) => ({ ...prev, pan: undefined }));
                        }
                      }}
                      maxLength={10}
                      placeholder="AAAAA0000A"
                      className={`w-full text-xs rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 font-tech tabular-nums ${
                        validationErrors.pan
                          ? "border-red-500 focus:ring-red-500"
                          : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                      }`}
                      data-testid="input-company-pan"
                    />
                    {validationErrors.pan && (
                      <p className="text-[10px] text-red-500 mt-1">{validationErrors.pan}</p>
                    )}
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Registered State
                    </label>
                    <select
                      value={settings.company.state || "Karnataka"}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, state: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid="select-company-state"
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s.code} value={s.name}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Letter of Undertaking (LUT) ARN
                    </label>
                    <input
                      type="text"
                      value={settings.company.lutNumber || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          company: { ...prev.company, lutNumber: e.target.value.toUpperCase() },
                        }))
                      }
                      placeholder="AD2903260000001"
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                      data-testid="input-company-lut"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Zero-rated export of services under Sec 16 IGST Act without payment of tax
                    </p>
                  </div>
                </div>
              </div>

              {/* Address & Banking */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Address */}
                <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                    <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      Registered Address
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Street Address Line 1
                      </label>
                      <input
                        type="text"
                        value={settings.company.addressLine1 || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            company: { ...prev.company, addressLine1: e.target.value },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Address Line 2 (Area/Locality)
                      </label>
                      <input
                        type="text"
                        value={settings.company.addressLine2 || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            company: { ...prev.company, addressLine2: e.target.value },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={settings.company.city || ""}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, city: e.target.value },
                            }))
                          }
                          className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          Postal Code / PIN
                        </label>
                        <input
                          type="text"
                          value={settings.company.postalCode || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, postalCode: val },
                            }));
                            if (val.trim()) {
                              const res = validatePincode(val, settings.company.country || "IN");
                              setValidationErrors((prev) => ({
                                ...prev,
                                postalCode: res.valid ? undefined : res.error,
                              }));
                            } else {
                              setValidationErrors((prev) => ({ ...prev, postalCode: undefined }));
                            }
                          }}
                          className={`w-full text-xs rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 font-tech tabular-nums ${
                            validationErrors.postalCode
                              ? "border-red-500 focus:ring-red-500"
                              : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-500"
                          }`}
                          placeholder="560001"
                          data-testid="input-company-postal-code"
                        />
                        {validationErrors.postalCode && (
                          <p className="text-[10px] text-red-500 mt-1">{validationErrors.postalCode}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banking details */}
                <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                    <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      Bank &amp; UPI Settlement Details
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={settings.company.bankName || ""}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, bankName: e.target.value },
                            }))
                          }
                          className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g. HDFC Bank"
                          data-testid="input-company-bank-name"
                        />
                      </div>

                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          IFSC Code
                        </label>
                        <input
                          type="text"
                          value={settings.company.ifsc || ""}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, ifsc: e.target.value.toUpperCase() },
                            }))
                          }
                          className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                          placeholder="HDFC0001234"
                          data-testid="input-company-ifsc"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={settings.company.accountNumber || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            company: { ...prev.company, accountNumber: e.target.value },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                        placeholder="50200012345678"
                        data-testid="input-company-account-number"
                      />
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        UPI ID / Virtual Payment Address (VPA)
                      </label>
                      <input
                        type="text"
                        value={settings.company.upiId || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            company: { ...prev.company, upiId: e.target.value },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                        placeholder="company@bank"
                        data-testid="input-company-upi-id"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          SWIFT / BIC Code
                        </label>
                        <input
                          type="text"
                          value={settings.company.swiftBic || ""}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, swiftBic: e.target.value.toUpperCase() },
                            }))
                          }
                          placeholder="HDFCINBBXXX"
                          className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                          data-testid="input-company-swift-bic"
                        />
                      </div>

                      <div>
                        <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                          IBAN (International Account)
                        </label>
                        <input
                          type="text"
                          value={settings.company.iban || ""}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              company: { ...prev.company, iban: e.target.value.toUpperCase() },
                            }))
                          }
                          placeholder="Optional for wire transfer"
                          className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                          data-testid="input-company-iban"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EMAIL & SMTP */}
          {activeTab === "email" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      SMTP Server Credentials (Nodemailer)
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Passwords are authenticated securely and stored encrypted using AES-256-GCM.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      SMTP Host Server
                    </label>
                    <input
                      type="text"
                      value={settings.email.host}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          email: { ...prev.email, host: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                      placeholder="smtp.gmail.com"
                      required
                      data-testid="input-smtp-host"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={settings.email.port}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          email: { ...prev.email, port: Number(e.target.value) },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                      required
                      data-testid="input-smtp-port"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      SMTP Username / Email
                    </label>
                    <input
                      type="text"
                      value={settings.email.user}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          email: { ...prev.email, user: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                      placeholder="user@rapidshiftlabs.com"
                      data-testid="input-smtp-user"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      SMTP Password / App Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={settings.email.pass}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            email: { ...prev.email, pass: e.target.value },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 pr-10 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                        placeholder="••••••••••••••••"
                        data-testid="input-smtp-pass"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Sender Name (From)
                    </label>
                    <input
                      type="text"
                      value={settings.email.fromName}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          email: { ...prev.email, fromName: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="RapidShift Labs Billing"
                      data-testid="input-smtp-from-name"
                    />
                  </div>

                  <div>
                    <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                      Sender Address (From Email)
                    </label>
                    <input
                      type="email"
                      value={settings.email.fromEmail}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          email: { ...prev.email, fromEmail: e.target.value },
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="billing@rapidshiftlabs.com"
                      data-testid="input-smtp-from-email"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={settings.email.secure}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        email: { ...prev.email, secure: e.target.checked },
                      }))
                    }
                    className="rounded text-blue-600 focus:ring-blue-500"
                    data-testid="checkbox-smtp-secure"
                  />
                  <label htmlFor="smtpSecure" className="text-xs text-zinc-600 dark:text-zinc-400">
                    Use SSL / TLS connection (typically port 465)
                  </label>
                </div>
              </div>

              {/* Test Email Card */}
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      Test SMTP Connectivity & Dispatch
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Send an end-to-end test notification using your configured SMTP settings.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="email"
                    value={testEmailTarget}
                    onChange={(e) => setTestEmailTarget(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="input-test-email-target"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail || !testEmailTarget}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-50 transition cursor-pointer"
                    data-testid="send-test-email-btn"
                  >
                    {sendingTestEmail ? (
                      <>
                        <IosSpinner size="sm" className="text-current" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Test Email</span>
                      </>
                    )}
                  </button>
                </div>

                {testEmailResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      testEmailResult.success
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                        : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
                    }`}
                    data-testid="test-email-result"
                  >
                    {testEmailResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    )}
                    <span>{testEmailResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: INVOICE NUMBERING */}
          {activeTab === "numbering" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                      Sequential Invoice Series Configuration
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Indian statutory GST compliance mandates distinct sequential numbering series per mode.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* GST Series */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                        GST Invoice Series
                      </span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded font-tech tabular-nums">
                        Active
                      </span>
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Prefix
                      </label>
                      <input
                        type="text"
                        value={settings.numbering.gstPrefix}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            numbering: { ...prev.numbering, gstPrefix: e.target.value.toUpperCase() },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white font-tech tabular-nums"
                        data-testid="input-gst-prefix"
                      />
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Next Sequence Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={settings.numbering.nextGstSequence}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            numbering: { ...prev.numbering, nextGstSequence: Number(e.target.value) },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white font-tech tabular-nums"
                        data-testid="input-next-gst-seq"
                      />
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 text-xs">
                      <span className="text-zinc-400 block text-[10px]">Sample Next Invoice Number:</span>
                      <span className="font-tech tabular-nums font-bold text-zinc-900 dark:text-white" data-testid="preview-gst-seq">
                        {gstPreview}
                      </span>
                    </div>
                  </div>

                  {/* Non-GST Series */}
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                        Non-GST Invoice Series
                      </span>
                      <span className="text-[10px] bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 px-2 py-0.5 rounded font-tech tabular-nums">
                        Active
                      </span>
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Prefix
                      </label>
                      <input
                        type="text"
                        value={settings.numbering.nonGstPrefix}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            numbering: { ...prev.numbering, nonGstPrefix: e.target.value.toUpperCase() },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white font-tech tabular-nums"
                        data-testid="input-nongst-prefix"
                      />
                    </div>

                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Next Sequence Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={settings.numbering.nextNonGstSequence}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            numbering: { ...prev.numbering, nextNonGstSequence: Number(e.target.value) },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white font-tech tabular-nums"
                        data-testid="input-next-nongst-seq"
                      />
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 text-xs">
                      <span className="text-zinc-400 block text-[10px]">Sample Next Invoice Number:</span>
                      <span className="font-tech tabular-nums font-bold text-zinc-900 dark:text-white" data-testid="preview-nongst-seq">
                        {nonGstPreview}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GITHUB INTEGRATION */}
          {activeTab === "github" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                        Global GitHub Organization Integration
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        RapidShift uses one global GitHub account to sync releases and conventional commits across all client repositories.
                      </p>
                    </div>
                  </div>
                  {settings.github?.hasToken && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Token Configured {settings.github.tokenPreview ? `(${settings.github.tokenPreview})` : ""}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300">
                        Organization Personal Access Token (PAT)
                      </label>
                      <span className="text-[10px] text-zinc-400">
                        Requires read permissions on repos/contents
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type={showGitHubToken ? "text" : "password"}
                        value={settings.github?.token || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            github: {
                              ...prev.github,
                              token: e.target.value,
                            },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 pr-10 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech tabular-nums"
                        placeholder={
                          settings.github?.hasToken
                            ? "Enter new token to replace existing encrypted token..."
                            : "ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_xxxxxxxxxxxxxxxxxxxx"
                        }
                        data-testid="input-github-token"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGitHubToken(!showGitHubToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        {showGitHubToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Token is securely encrypted at rest using AES-256-GCM. It is never exposed in client bundles or public APIs.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="steel-metric-label block text-zinc-700 dark:text-zinc-300 mb-1">
                        Default Branch Name
                      </label>
                      <input
                        type="text"
                        value={settings.github?.defaultBranch || "main"}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            github: {
                              ...prev.github,
                              defaultBranch: e.target.value.trim(),
                            },
                          }))
                        }
                        className="w-full text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
                        placeholder="main"
                        data-testid="input-github-default-branch"
                      />
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Standard trunk branch used if not overridden per client or project.
                      </p>
                    </div>

                    <div className="flex flex-col justify-end">
                      <button
                        type="button"
                        onClick={handleTestGitHubConnection}
                        disabled={testingGitHub}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-50 transition cursor-pointer shadow-xs"
                        data-testid="test-github-btn"
                      >
                        {testingGitHub ? (
                          <>
                            <IosSpinner size="sm" className="text-current" />
                            <span>Verifying GitHub Token...</span>
                          </>
                        ) : (
                          <>
                            <GitBranch className="w-3.5 h-3.5" />
                            <span>Test Token &amp; Check Rate Limits</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {gitHubTestResult && (
                    <div
                      className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                        gitHubTestResult.ok
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
                      }`}
                      data-testid="github-test-result"
                    >
                      <div className="flex items-center gap-2.5">
                        {gitHubTestResult.ok ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-medium">{gitHubTestResult.message}</span>
                      </div>
                      {gitHubTestResult.rateLimitRemaining !== undefined && (
                        <span className="font-tech tabular-nums font-semibold px-2 py-0.5 rounded bg-white/60 dark:bg-black/40 text-[11px]">
                          {gitHubTestResult.rateLimitRemaining.toLocaleString()} API calls left
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Informational Callout */}
              <div className="p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Client Portal Visibility Rules</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                  Client portals present only clean, human-readable release notes, official version tags, and classified conventional commits (<span className="text-emerald-600 dark:text-emerald-400 font-semibold">Features ✨</span>, <span className="text-amber-600 dark:text-amber-400 font-semibold">Bug Fixes 🐛</span>, and <span className="text-blue-600 dark:text-blue-400 font-semibold">Performance ⚡</span>). Raw git hash commits, internal chore branches, Dependabot bumps, and merge pull requests are automatically filtered out.
                </p>
              </div>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
