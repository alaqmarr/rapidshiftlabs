import type { IReleaseRepository, ReleaseFilter } from "../../domain/ports/release-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import type { ReleaseLink } from "../../domain/entities/release-link.entity";

export class ListReleasesUseCase {
  constructor(private readonly repo: IReleaseRepository) {}

  async execute(filter: ReleaseFilter, actor: Actor): Promise<ReleaseLink[]> {
    assertCan(actor, "releases:read");
    const scopedClientId = scopeClientId(actor, filter.clientId);

    return this.repo.list({
      ...filter,
      clientId: scopedClientId,
    });
  }
}
