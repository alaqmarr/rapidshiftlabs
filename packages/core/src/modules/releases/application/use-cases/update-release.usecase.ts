import type { IReleaseRepository } from "../../domain/ports/release-repository.port";
import { UpdateReleaseSchema, type UpdateReleaseDTO } from "../dtos/release.dto";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { ReleaseLink } from "../../domain/entities/release-link.entity";

export class UpdateReleaseUseCase {
  constructor(private readonly repo: IReleaseRepository) {}

  async execute(id: string, input: UpdateReleaseDTO, actor: Actor): Promise<ReleaseLink> {
    assertCan(actor, "releases:write");

    const release = await this.repo.findById(id);
    if (!release) {
      throw new NotFoundError(`Release ${id} not found`);
    }

    assertTenant(actor, release.clientId);

    const validated = UpdateReleaseSchema.parse(input);
    release.update(validated);
    await this.repo.save(release);

    return release;
  }
}
