import type { Entitlement } from "../entities/entitlement.aggregate";

export interface IEntitlementRepository {
  findById(id: string, tx?: any): Promise<Entitlement | null>;
  findByClientId(clientId: string, tx?: any): Promise<Entitlement | null>;
  save(entitlement: Entitlement, tx?: any): Promise<void>;
  listBlocked(limit?: number): Promise<Entitlement[]>;
}
