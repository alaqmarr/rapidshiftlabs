import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Actor = who is executing a use case. Every application command/query receives
 * an Actor and performs its own authorization (defence in depth: the HTTP layer
 * and proxy are NOT the security boundary — the application layer is).
 */
export const PERMISSIONS = [
  "clients:read",
  "clients:write",
  "contracts:read",
  "contracts:write",
  "billing:read",
  "billing:write",
  "access:read",
  "entitlement:override",
  "fleet:read",
  "fleet:write",
  "fleet:restart",
  "fleet:logs",
  "monitoring:read",
  "monitoring:write",
  "support:read",
  "support:write",
  "support:escalate",
  "support:manage",
  "analytics:read",
  "analytics:write",
  "vault:read",
  "vault:reveal",
  "vault:write",
  "releases:read",
  "releases:write",
  "apikeys:read",
  "apikeys:write",
  "webhooks:read",
  "webhooks:write",
  "embeds:create",
  "settings:read",
  "settings:write",
  "team:read",
  "team:write",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type AdminRole = "owner" | "superadmin" | "finance" | "ops" | "support";
export type ClientRole = "client_admin" | "client_member";

export const ADMIN_ROLES: AdminRole[] = ["owner", "superadmin", "finance", "ops", "support"];
export const CLIENT_ROLES: ClientRole[] = ["client_admin", "client_member"];

const ALL = [...PERMISSIONS] as Permission[];

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  superadmin: ALL,
  finance: [
    "clients:read", "clients:write", "contracts:read", "contracts:write", "billing:read", "billing:write",
    "access:read", "entitlement:override", "analytics:read", "support:read", "support:write",
    "monitoring:read", "fleet:read", "releases:read", "settings:read", "audit:read", "apikeys:read", "webhooks:read",
    "embeds:create",
  ],
  ops: [
    "clients:read", "contracts:read", "billing:read", "access:read", "fleet:read", "fleet:write", "fleet:restart",
    "fleet:logs", "monitoring:read", "monitoring:write", "support:read", "support:write", "support:escalate",
    "analytics:read", "vault:read", "vault:reveal", "vault:write", "releases:read", "releases:write",
    "apikeys:read", "apikeys:write", "webhooks:read", "webhooks:write", "embeds:create", "audit:read",
  ],
  support: [
    "clients:read", "contracts:read", "billing:read", "access:read", "fleet:read", "fleet:restart", "fleet:logs",
    "monitoring:read", "support:read", "support:write", "support:escalate", "support:manage", "analytics:read", "releases:read",
    "vault:read", "vault:reveal", "apikeys:read", "webhooks:read", "embeds:create",
  ],
};

/** What a logged-in client user may do (always scoped to their own client). */
export const CLIENT_ROLE_PERMISSIONS: Record<ClientRole, Permission[]> = {
  client_admin: [
    "billing:read", "contracts:read", "access:read", "fleet:read", "fleet:restart", "fleet:logs",
    "monitoring:read", "support:read", "support:write", "support:escalate", "analytics:read", "analytics:write",
    "vault:read", "vault:reveal", "releases:read", "apikeys:read", "apikeys:write", "webhooks:read",
    "webhooks:write", "embeds:create", "clients:read", "team:write",
  ],
  client_member: [
    "billing:read", "contracts:read", "access:read", "fleet:read", "fleet:logs", "monitoring:read",
    "support:read", "support:write", "analytics:read", "releases:read", "clients:read",
  ],
};

/** Scopes that may be granted to client API keys. */
export const API_KEY_SCOPES: Permission[] = [
  "access:read", "billing:read", "contracts:read", "fleet:read", "fleet:restart", "fleet:logs",
  "monitoring:read", "support:read", "support:write", "support:escalate", "analytics:read", "analytics:write",
  "releases:read", "vault:read", "vault:reveal", "embeds:create", "webhooks:read", "webhooks:write", "clients:read",
];

export type Actor =
  | { kind: "admin"; id: string; email: string; name: string; role: AdminRole; supportLevel: 1 | 2 | 3 | null }
  | { kind: "client_user"; id: string; email: string; name: string; clientId: string; role: ClientRole }
  | { kind: "api_key"; id: string; clientId: string; scopes: Permission[]; keyType: "secret" | "publishable" }
  | { kind: "embed"; clientId: string; scopes: Permission[]; widget: string }
  | { kind: "system"; name: string };

export function permissionsOf(actor: Actor): Permission[] {
  switch (actor.kind) {
    case "admin":
      return ADMIN_ROLE_PERMISSIONS[actor.role];
    case "client_user":
      return CLIENT_ROLE_PERMISSIONS[actor.role];
    case "api_key":
    case "embed":
      return actor.scopes;
    case "system":
      return ALL;
  }
}

export function can(actor: Actor, permission: Permission): boolean {
  return permissionsOf(actor).includes(permission);
}

export function assertCan(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
  if (!can(actor, permission)) throw new ForbiddenError(`Missing permission '${permission}'`);
}

/** Tenant scoping: client-side actors can only touch their own client's data. */
export function tenantOf(actor: Actor): string | null {
  return actor.kind === "client_user" || actor.kind === "api_key" || actor.kind === "embed" ? actor.clientId : null;
}

export function isStaff(actor: Actor): boolean {
  return actor.kind === "admin" || actor.kind === "system";
}

export function isSuperAdmin(actor: Actor): boolean {
  return actor.kind === "system" || (actor.kind === "admin" && (actor.role === "owner" || actor.role === "superadmin"));
}

export function assertTenant(actor: Actor, clientId: string) {
  const tenant = tenantOf(actor);
  if (tenant !== null && tenant !== clientId) throw new ForbiddenError("Resource belongs to another client");
}

/** Convenience: resolve the client id a query must be scoped to. */
export function scopeClientId(actor: Actor, requested?: string | null): string | null {
  const tenant = tenantOf(actor);
  if (tenant) return tenant;
  return requested ?? null;
}

export function actorLabel(actor: Actor): string {
  switch (actor.kind) {
    case "admin":
    case "client_user":
      return `${actor.name} <${actor.email}>`;
    case "api_key":
      return `api_key:${actor.id}`;
    case "embed":
      return `embed:${actor.widget}`;
    case "system":
      return `system:${actor.name}`;
  }
}

export function actorId(actor: Actor): string {
  return actor.kind === "system" ? `system:${actor.name}` : actor.kind === "embed" ? `embed:${actor.clientId}` : actor.id;
}

export const SYSTEM_ACTOR = (name: string): Actor => ({ kind: "system", name });
