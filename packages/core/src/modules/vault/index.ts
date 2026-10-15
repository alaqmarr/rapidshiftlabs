import { DrizzleVaultRepository } from "./infrastructure/repositories/drizzle-vault.repository";
import type { IVaultRepository } from "./domain/ports/vault-repository.port";
import { CreateCredentialUseCase } from "./application/use-cases/create-credential.usecase";
import { RevealCredentialUseCase } from "./application/use-cases/reveal-credential.usecase";
import { ListCredentialsUseCase } from "./application/use-cases/list-credentials.usecase";
import { DeleteCredentialUseCase } from "./application/use-cases/delete-credential.usecase";

// Domain exports
export * from "./domain/entities/vault-credential.entity";
export * from "./domain/ports/vault-repository.port";

// Application exports
export * from "./application/dtos/vault.dto";
export * from "./application/use-cases/create-credential.usecase";
export * from "./application/use-cases/reveal-credential.usecase";
export * from "./application/use-cases/list-credentials.usecase";
export * from "./application/use-cases/delete-credential.usecase";

// Infrastructure exports
export * from "./infrastructure/repositories/drizzle-vault.repository";

export interface VaultModuleDependencies {
  vaultRepo?: IVaultRepository;
}

export class VaultModule {
  public readonly repo: IVaultRepository;

  public readonly createCredentialUseCase: CreateCredentialUseCase;
  public readonly revealCredentialUseCase: RevealCredentialUseCase;
  public readonly listCredentialsUseCase: ListCredentialsUseCase;
  public readonly deleteCredentialUseCase: DeleteCredentialUseCase;

  constructor(deps?: VaultModuleDependencies) {
    this.repo = deps?.vaultRepo ?? new DrizzleVaultRepository();

    this.createCredentialUseCase = new CreateCredentialUseCase(this.repo);
    this.revealCredentialUseCase = new RevealCredentialUseCase(this.repo);
    this.listCredentialsUseCase = new ListCredentialsUseCase(this.repo);
    this.deleteCredentialUseCase = new DeleteCredentialUseCase(this.repo);
  }
}

let vaultModuleInstance: VaultModule | null = null;

export function getVaultModule(deps?: VaultModuleDependencies): VaultModule {
  if (!vaultModuleInstance || deps) {
    vaultModuleInstance = new VaultModule(deps);
  }
  return vaultModuleInstance;
}
