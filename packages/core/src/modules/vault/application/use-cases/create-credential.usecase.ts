import { AesGcmCipher } from "../../../../shared/infrastructure/crypto/aes-gcm-cipher";
import { VaultCredential } from "../../domain/entities/vault-credential.entity";
import type { IVaultRepository } from "../../domain/ports/vault-repository.port";
import { CreateCredentialSchema, type CreateCredentialDTO } from "../dtos/vault.dto";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";

function resolveVaultMasterKey(injectedKey?: string): string {
  if (injectedKey) return injectedKey;
  const envKey = process.env.VAULT_MASTER_KEY || process.env.MASTER_KEY || process.env.AUTH_SECRET;
  if (envKey) return envKey;
  if (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return "rsl_master_vault_encryption_key_32";
  }
  throw new Error("VAULT_MASTER_KEY environment variable is required to operate vault credentials");
}

export class CreateCredentialUseCase {
  private readonly masterKey: string;

  constructor(
    private readonly repo: IVaultRepository,
    masterKey?: string,
  ) {
    this.masterKey = resolveVaultMasterKey(masterKey);
  }

  async execute(input: CreateCredentialDTO, actor: Actor): Promise<VaultCredential> {
    assertCan(actor, "vault:write");
    assertTenant(actor, input.clientId);

    const validated = CreateCredentialSchema.parse(input);
    const encryptedValue = AesGcmCipher.encrypt(validated.secretValue, this.masterKey);

    const credential = VaultCredential.create({
      clientId: validated.clientId,
      projectId: validated.projectId,
      name: validated.name,
      category: validated.category,
      username: validated.username,
      encryptedValue,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
      expiresAt: validated.expiresAt,
      oneTimeReveal: validated.oneTimeReveal,
    });

    await this.repo.save(credential);
    return credential;
  }
}
