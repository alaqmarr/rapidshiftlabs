import { Project, type CreateProjectParams } from "../../domain/entities/project.entity";
import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class CreateProjectUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(params: CreateProjectParams): Promise<Project> {
    const client = await this.repo.findById(params.clientId);
    if (!client) {
      throw new NotFoundError("Client", params.clientId);
    }

    const project = Project.create(params);
    await this.repo.addProject(project);
    return project;
  }
}
