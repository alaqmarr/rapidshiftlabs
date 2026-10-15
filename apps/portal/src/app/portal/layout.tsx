import type React from "react";
import { headers } from "next/headers";
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

  let clientName: string | undefined;
  const clientId = session?.user?.clientId || "client_acme_corp";
  if (session?.user?.clientId) {
    try {
      const container = getContainer();
      const client = await container.clientDirectoryRepo.findById(session.user.clientId);
      if (client) clientName = client.name;
    } catch {
      // Graceful fallback to default title
    }
  }

  return (
    <PortalShell
      userEmail={session?.user?.email || "client@acme.com"}
      userRole={session?.user?.role || "client_admin"}
      clientId={clientId}
      clientName={clientName || "Client Portal"}
    >
      {children}
    </PortalShell>
  );
}
