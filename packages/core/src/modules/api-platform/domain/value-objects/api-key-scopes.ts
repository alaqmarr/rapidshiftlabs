import { API_KEY_SCOPES, type Permission } from "../../../../shared/kernel/actor";

export const VALID_API_KEY_SCOPES: readonly Permission[] = API_KEY_SCOPES;
export type ApiKeyScope = Permission;
