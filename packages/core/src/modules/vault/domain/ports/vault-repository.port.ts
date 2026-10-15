import type { VaultCredential, VaultCategory } from "../entities/vault-credential.entity";

export interface VaultFilter {
  clientId?: string | null;
  projectId?: string | null;
  category?: VaultCategory;
}

export interface IVaultRepository {
  save(credential: VaultCredential): Promise<void>;
  findById(id: string): Promise<VaultCredential | null>;
  list(filter?: VaultFilter): Promise<VaultCredential[]>;
  delete(id: string): Promise<void>;
}
