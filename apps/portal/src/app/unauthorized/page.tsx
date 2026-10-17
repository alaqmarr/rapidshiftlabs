"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldAlert,
  Lock,
  Home,
  ArrowLeft,
  KeyRound,
  Users,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get("reason") || "role_restricted";
  const role = searchParams.get("role") || "authenticated user";
  const targetPath = searchParams.get("path") || "";

  const isRealmMismatch = reason === "realm_mismatch";

  return (
    <SystemStateShell
      httpCode="403"
      badgeLabel={
        isRealmMismatch
          ? "Realm Isolation Enforced"
          : "RBAC Role Segregation • Access Restricted"
      }
      tone="purple"
      title={
        isRealmMismatch
          ? "Cross-Realm Session Access Denied"
          : "Insufficient Role Permissions for This Module"
      }
      subtitle={
        isRealmMismatch
          ? "Admin Control Plane sessions and Client Service Layer sessions are cryptographically segregated. Please sign in with an account belonging to the target realm."
          : `Your current staff role (${role.toUpperCase()}) does not have permission to access ${
              targetPath || "this restricted administrative suite"
            }.`
      }
      icon={ShieldAlert}
      metrics={[
        { label: "Active Role", value: role.toUpperCase(), status: "warn" },
        { label: "Target Path", value: targetPath || "Restricted Suite", status: "err" },
        { label: "RBAC Policy", value: "Strict Enforcement", status: "ok" },
        { label: "Audit Trail", value: "Logged", status: "neutral" },
      ]}
      actions={[
        {
          label: "Return to Allowed Dashboard",
          href: targetPath.startsWith("/portal") ? "/portal" : "/admin",
          variant: "primary",
          icon: Home,
        },
        {
          label: "Sign In with Different Account",
          href: targetPath.startsWith("/portal") ? "/portal/login" : "/admin/login",
          variant: "secondary",
          icon: KeyRound,
        },
        {
          label: "Go Back",
          onClick: () => router.back(),
          variant: "ghost",
          icon: ArrowLeft,
        },
      ]}
    >
      <div className="p-4 rounded-2xl bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2.5 text-xs">
        <div className="font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-purple-500" />
          <span>RapidShift Role-Based Access Control (RBAC) Matrix</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
            <strong className="text-zinc-900 dark:text-zinc-100">Owner / SuperAdmin:</strong> Full commercial, infrastructure, vault, team &amp; settings access.
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
            <strong className="text-zinc-900 dark:text-zinc-100">Finance:</strong> Clients, Contracts, GST Invoices, Payments &amp; Analytics.
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
            <strong className="text-zinc-900 dark:text-zinc-100">Operations (Ops):</strong> Fleet &amp; PM2, Domains &amp; SSL, Vault, Releases &amp; Support.
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800">
            <strong className="text-zinc-900 dark:text-zinc-100">Support:</strong> 24×7 SLA Support Desk, Clients (Read) &amp; Domain Status.
          </div>
        </div>
      </div>
    </SystemStateShell>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <UnauthorizedContent />
    </Suspense>
  );
}
