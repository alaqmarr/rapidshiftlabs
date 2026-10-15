import type React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { PortalShell } from "@/features/portal/portal-shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
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
  if (pathname === "/portal/login") {
    return <>{children}</>;
  }

  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) {
    redirect("/portal/login");
  }

  let clientName: string | undefined;
  try {
    const container = getContainer();
    const client = await container.clientDirectoryRepo.findById(clientId);
    if (client) clientName = client.name;
  } catch {
    // Graceful fallback to default title
  }

  return (
    <PortalShell
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "client_admin"}
      clientId={clientId}
      clientName={clientName || "Client Portal"}
    >
      {children}
    </PortalShell>
  );
}
