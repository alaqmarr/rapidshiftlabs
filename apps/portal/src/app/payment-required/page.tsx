"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  ShieldAlert,
  Lock,
  CheckCircle2,
  RefreshCw,
  LifeBuoy,
  Receipt,
  Building2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

function PaymentRequiredContent() {
  const searchParams = useSearchParams();
  const stage = (searchParams.get("stage") || "blocked").toLowerCase();
  const clientName = searchParams.get("client") || "Your Organization";
  const invoiceNumber = searchParams.get("invoice") || "Pending Settlement";
  const daysOverdue = Number(searchParams.get("daysOverdue") || (stage === "restricted" ? 5 : 8));
  const amountDueRaw = searchParams.get("amount");
  const returnUrl = searchParams.get("returnUrl") || searchParams.get("callbackUrl") || "/portal";

  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const isRestrictedOnly = stage === "restricted";

  const formattedAmount = amountDueRaw
    ? amountDueRaw.startsWith("₹") || amountDueRaw.startsWith("$")
      ? amountDueRaw
      : `₹${Number(amountDueRaw).toLocaleString("en-IN")}`
    : "View in Billing Portal";

  const handleVerifyClearance = async () => {
    setVerifying(true);
    setVerifyMessage(null);
    try {
      const res = await fetch("/api/v1/health", { cache: "no-store" });
      if (res.ok) {
        setVerifyMessage(
          "Control Plane reachable. Once your payment is recorded in the Billing Ledger, the Access Gate unlocks within 5 seconds.",
        );
      }
    } catch {
      setVerifyMessage("Unable to reach Control Plane right now.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SystemStateShell
      httpCode="402"
      badgeLabel={
        isRestrictedOnly
          ? "Stage 2 • Admin Routes Restricted"
          : "Stage 3 • Access Gate Locked (Payment Due)"
      }
      tone={isRestrictedOnly ? "amber" : "rose"}
      title={
        isRestrictedOnly
          ? "Administrative Routes Restricted Pending Invoice Settlement"
          : "Service Access Temporarily Paused — Payment Required"
      }
      subtitle={
        isRestrictedOnly
          ? `Public customer-facing routes for ${clientName} remain 100% online, but administrative routes (/admin) are restricted until overdue receivables are cleared.`
          : `Access to ${clientName} is currently gated by the RapidShift Entitlement Engine due to an overdue invoice balance (${daysOverdue}+ days past due).`
      }
      icon={isRestrictedOnly ? ShieldAlert : Lock}
      metrics={[
        {
          label: "Gate Enforcement",
          value: isRestrictedOnly ? "Stage 2 (Restricted)" : "Stage 3 (Strict Lock)",
          status: isRestrictedOnly ? "warn" : "err",
        },
        {
          label: "Overdue Age",
          value: `${daysOverdue} Days Past Due`,
          status: isRestrictedOnly ? "warn" : "err",
        },
        {
          label: "Invoice Reference",
          value: invoiceNumber,
          status: "neutral",
        },
        {
          label: "Balance Due",
          value: formattedAmount,
          status: "warn",
        },
      ]}
      actions={[
        {
          label: "Settle Invoice in Client Portal",
          href: "/portal/billing",
          variant: "primary",
          icon: CreditCard,
        },
        {
          label: verifying ? "Checking Gate Status..." : "Re-Verify Clearance Status",
          onClick: handleVerifyClearance,
          variant: "secondary",
          icon: RefreshCw,
        },
        {
          label: "Contact Commercial & SLA Desk",
          href: "/portal/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
      ]}
    >
      <div className="space-y-4">
        {/* 3-Stage Tiered Access Gate Progression Visual */}
        <div className="p-4 rounded-2xl bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              RapidShift 3-Stage Tiered Entitlement Policy
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Instant Unlock (&lt;5s) on Settlement
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl border bg-white/70 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800">
              <div className="font-mono text-[10px] uppercase text-blue-500 font-bold">
                Stage 1 • Days 1–3
              </div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                Grace Period Banner
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                100% app &amp; admin access allowed with subtle settlement notice.
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isRestrictedOnly
                  ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30"
                  : "bg-white/70 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800"
              }`}
            >
              <div className="font-mono text-[10px] uppercase text-amber-500 font-bold">
                Stage 2 • Days 4–7
              </div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                Admin Restricted Mode
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Public traffic stays live; `/admin` routes redirect to settlement.
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                !isRestrictedOnly
                  ? "bg-rose-500/10 border-rose-500/40 ring-1 ring-rose-500/30"
                  : "bg-white/70 dark:bg-zinc-900/60 border-zinc-200/70 dark:border-zinc-800"
              }`}
            >
              <div className="font-mono text-[10px] uppercase text-rose-500 font-bold">
                Stage 3 • Day 8+
              </div>
              <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                Strict Access Gate Lock
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                All application routes paused until overdue invoice is cleared.
              </div>
            </div>
          </div>
        </div>

        {/* Fast Restoration Steps */}
        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span>How to restore full access immediately:</span>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">
              Sign in to the{" "}
              <a href="/portal/billing" className="text-blue-600 dark:text-blue-400 font-semibold underline">
                Client Billing Portal
              </a>{" "}
              to download your GST/Commercial invoice PDF and submit your UPI/NEFT/RTGS/Wire reference.
            </p>
          </div>
          {returnUrl && returnUrl !== "/portal" && (
            <a
              href={returnUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-800 dark:text-zinc-200 hover:border-blue-500/40 shrink-0"
            >
              <span>Return to App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {verifyMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {verifyMessage}
          </div>
        )}
      </div>
    </SystemStateShell>
  );
}

export default function PaymentRequiredPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <PaymentRequiredContent />
    </Suspense>
  );
}
