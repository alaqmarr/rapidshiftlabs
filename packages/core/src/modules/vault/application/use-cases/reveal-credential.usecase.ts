import { AesGcmCipher } from "../../../../shared/infrastructure/crypto/aes-gcm-cipher";
import type { IVaultRepository } from "../../domain/ports/vault-repository.port";
import { type Actor, assertCan, assertTenant, actorId } from "../../../../shared/kernel/actor";
import { ForbiddenError, NotFoundError } from "../../../../shared/kernel/errors";
import { getAuditModule, type AuditModule } from "../../../audit";

export interface RevealedSecretDTO {
  id: string;
  name: string;
  category: string;
  username?: string | null;
  secretValue: string;
  revealedCount: number;
}

function resolveVaultMasterKey(injectedKey?: string): string {
  if (injectedKey) return injectedKey;
  const envKey = process.env.VAULT_MASTER_KEY || process.env.MASTER_KEY || process.env.AUTH_SECRET;
  if (envKey) return envKey;
  if (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return "rsl_master_vault_encryption_key_32";
  }
  throw new Error("VAULT_MASTER_KEY environment variable is required to operate vault credentials");
}

export class RevealCredentialUseCase {
  private readonly masterKey: string;

  constructor(
    private readonly repo: IVaultRepository,
    private readonly auditModule: AuditModule = getAuditModule(),
    masterKey?: string,
  ) {
    this.masterKey = resolveVaultMasterKey(masterKey);
  }

  async execute(credentialId: string, actor: Actor): Promise<RevealedSecretDTO> {
    assertCan(actor, "vault:reveal");

    const credential = await this.repo.findById(credentialId);
    if (!credential) {
      throw new NotFoundError(`Credential ${credentialId} not found`);
    }

    assertTenant(actor, credential.clientId);

    if (credential.isExpired()) {
      throw new ForbiddenError("This credential has expired or has already been revealed");
    }

    // Decrypt the secret value
    const secretValue = AesGcmCipher.decrypt(credential.encryptedValue, this.masterKey);

    // Record the reveal in the aggregate
    credential.recordReveal();
    await this.repo.save(credential);

    // Write immutable record to Audit log
    await this.auditModule.log({
      clientId: credential.clientId,
      actorId: actorId(actor),
      actorType: actor.kind === "client_user" || actor.kind === "embed" ? "client" : actor.kind,
      action: "vault:reveal",
      entityType: "vault_credential",
      entityId: credential.id,
      details: JSON.stringify({
        credentialName: credential.name,
        category: credential.category,
        oneTimeReveal: credential.oneTimeReveal,
        revealedCount: credential.revealedCount,
      }),
    });

    return {
      id: credential.id,
      name: credential.name,
      category: credential.category,
      username: credential.props.username,
      secretValue,
      revealedCount: credential.revealedCount,
    };
  }
}
