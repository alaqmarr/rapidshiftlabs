import type React from "react";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { AdminShell } from "@/features/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname =
    headerList.get("x-rsl-pathname") ||
    headerList.get("x-invoke-path") ||
    headerList.get("x-matched-path") ||
    "";

  // Login page renders standalone without shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const session = await auth();

  return (
    <AdminShell
      userEmail={session?.user?.email || "admin@rapidshiftlabs.com"}
      userRole={session?.user?.role || "owner"}
    >
      {children}
    </AdminShell>
  );
}
