import { NextRequest, NextResponse } from "next/server";
import { getRequestActor } from "./auth-actor";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";

export type AdminActor = Extract<Actor, { kind: "admin" }>;

const INFRA_EXEC_ROLES = new Set(["owner", "superadmin", "ops"]);
const INFRA_READ_ROLES = new Set(["owner", "superadmin", "ops", "support"]);

export async function requireAdminRole(
  req: NextRequest,
  options?: { blockedRoles?: string[]; allowedRoles?: string[] }
): Promise<{ actor: AdminActor; errorResponse?: never } | { actor?: never; errorResponse: NextResponse }> {
  const actor = await getRequestActor(req);
  if (!actor || actor.kind !== "admin") {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Admin session required" },
        { status: 401 }
      ),
    };
  }

  if (options?.allowedRoles && !options.allowedRoles.includes(actor.role)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Insufficient admin role privileges" },
        { status: 403 }
      ),
    };
  }

  if (options?.blockedRoles && options.blockedRoles.includes(actor.role)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Role is restricted from this endpoint" },
        { status: 403 }
      ),
    };
  }

  return { actor };
}

export async function requireAdminInfraActor(
  req: NextRequest,
  options?: { allowSupportRead?: boolean }
): Promise<{ actor: AdminActor; errorResponse?: never } | { actor?: never; errorResponse: NextResponse }> {
  const actor = await getRequestActor(req);
  if (!actor || actor.kind !== "admin") {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Admin session required" },
        { status: 401 }
      ),
    };
  }

  const allowedSet = options?.allowSupportRead ? INFRA_READ_ROLES : INFRA_EXEC_ROLES;
  if (!allowedSet.has(actor.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          error:
            "Forbidden: Infrastructure operator privileges (Owner, SuperAdmin, or Ops) required",
        },
        { status: 403 }
      ),
    };
  }

  return { actor };
}

export async function logServerAudit(params: {
  actor: AdminActor;
  req: NextRequest;
  serverId: string;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const container = getContainer();
    const ipAddress =
      params.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      params.req.headers.get("x-real-ip") ||
      null;
    const userAgent = params.req.headers.get("user-agent") || null;

    await container.auditModule.log({
      actorId: params.actor.id,
      actorType: "admin",
      actorEmail: params.actor.email,
      action: params.action,
      entityType: "server",
      entityId: params.serverId,
      ipAddress,
      userAgent,
      details: params.details ? JSON.stringify(params.details) : null,
    });
  } catch (err) {
    console.warn("[Audit] Non-blocking server audit warning:", err);
  }
}

export function mapServerErrorStatus(error: any): number {
  if (typeof error?.status === "number" && error.status >= 400 && error.status < 600) {
    return error.status;
  }
  const name = String(error?.name || "");
  if (name === "NotFoundError") return 404;
  if (name === "ForbiddenError") return 403;
  if (name === "ValidationError" || name === "CommandSanitizationError") return 400;
  if (name === "RateLimitError") return 429;
  return 500;
}
