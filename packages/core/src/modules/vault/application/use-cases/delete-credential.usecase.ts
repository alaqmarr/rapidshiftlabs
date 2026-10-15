import type { IVaultRepository } from "../../domain/ports/vault-repository.port";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class DeleteCredentialUseCase {
  constructor(private readonly repo: IVaultRepository) {}

  async execute(credentialId: string, actor: Actor): Promise<void> {
    assertCan(actor, "vault:write");

    const credential = await this.repo.findById(credentialId);
    if (!credential) {
      throw new NotFoundError(`Credential ${credentialId} not found`);
    }

    assertTenant(actor, credential.clientId);

    await this.repo.delete(credentialId);
  }
}
