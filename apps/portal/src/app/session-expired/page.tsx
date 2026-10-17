"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Shield, Building2, Home } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

function SessionExpiredContent() {
  const searchParams = useSearchParams();
  const realm = searchParams.get("realm") || "client";
  const callbackUrl = searchParams.get("callbackUrl") || "";

  const isAdmin = realm === "admin" || callbackUrl.startsWith("/admin");

  return (
    <SystemStateShell
      httpCode="440"
      badgeLabel="Session Expired • Re-Authentication Required"
      tone="blue"
      title="Your Security Session Has Expired"
      subtitle="For your organization's security, your encrypted JWT session token has expired or was invalidated after account switching. Please sign in again to continue."
      icon={KeyRound}
      metrics={[
        { label: "Target Realm", value: isAdmin ? "Admin Console" : "Client Portal", status: "neutral" },
        { label: "Cookie State", value: "Cleared Safely", status: "ok" },
        { label: "Tenant Isolation", value: "Enforced", status: "ok" },
        { label: "Action Required", value: "Sign In", status: "warn" },
      ]}
      actions={[
        {
          label: isAdmin ? "Sign In to Admin Console" : "Sign In to Client Portal",
          href: isAdmin
            ? `/admin/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`
            : `/portal/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`,
          variant: "primary",
          icon: isAdmin ? Shield : Building2,
        },
        {
          label: isAdmin ? "Switch to Client Portal Login" : "Switch to Admin Login",
          href: isAdmin ? "/portal/login" : "/admin/login",
          variant: "secondary",
          icon: Home,
        },
      ]}
    />
  );
}

export default function SessionExpiredPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <SessionExpiredContent />
    </Suspense>
  );
}
