export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import type { Actor, AdminRole } from "@rsl/core/kernel";
import { AdminTeamView, type StaffMember } from "@/features/admin/admin-team-view";

export default async function AdminTeamPage() {
  const session = await auth();

  if (!session?.user || session.user.realm !== "admin") {
    redirect("/admin/login?callbackUrl=/admin/team");
  }

  const userRole = (session.user.role as AdminRole) || "support";
  if (userRole !== "owner" && userRole !== "superadmin") {
    redirect("/admin");
  }

  const actor: Actor = {
    kind: "admin",
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: userRole,
    supportLevel: (session.user.supportLevel as any) ?? null,
  };

  const container = getContainer();
  let staffList: StaffMember[] = [];

  try {
    const rawStaff = await container.identityModule.listAdminUsers(actor);
    staffList = rawStaff.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      supportLevel: s.supportLevel,
      status: s.status,
      sessionVersion: s.sessionVersion,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  } catch (error) {
    console.error("[AdminTeamPage] Failed to fetch staff list:", error);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <AdminTeamView
        initialStaff={staffList}
        currentUserEmail={session.user.email}
        currentUserId={session.user.id}
        currentUserRole={userRole}
      />
    </main>
  );
}
