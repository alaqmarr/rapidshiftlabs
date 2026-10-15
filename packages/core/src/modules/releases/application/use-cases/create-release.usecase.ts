import { ReleaseLink } from "../../domain/entities/release-link.entity";
import type { IReleaseRepository } from "../../domain/ports/release-repository.port";
import { CreateReleaseSchema, type CreateReleaseDTO } from "../dtos/release.dto";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";

export class CreateReleaseUseCase {
  constructor(private readonly repo: IReleaseRepository) {}

  async execute(input: CreateReleaseDTO, actor: Actor): Promise<ReleaseLink> {
    assertCan(actor, "releases:write");
    assertTenant(actor, input.clientId);

    const validated = CreateReleaseSchema.parse(input);
    const release = ReleaseLink.create({
      clientId: validated.clientId,
      projectId: validated.projectId,
      name: validated.name,
      version: validated.version,
      environment: validated.environment,
      url: validated.url,
      status: validated.status,
      releaseNotes: validated.releaseNotes,
      password: validated.password,
      expiresAt: validated.expiresAt,
    });

    await this.repo.save(release);
    return release;
  }
}
