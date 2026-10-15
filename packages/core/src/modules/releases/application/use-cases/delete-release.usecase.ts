import type { IReleaseRepository } from "../../domain/ports/release-repository.port";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class DeleteReleaseUseCase {
  constructor(private readonly repo: IReleaseRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    assertCan(actor, "releases:write");

    const release = await this.repo.findById(id);
    if (!release) {
      throw new NotFoundError(`Release ${id} not found`);
    }

    assertTenant(actor, release.clientId);

    await this.repo.delete(id);
  }
}
