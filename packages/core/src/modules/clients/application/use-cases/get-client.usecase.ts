import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import type { Client } from "../../domain/entities/client.entity";
import type { ClientContact } from "../../domain/entities/client-contact.entity";
import type { Project } from "../../domain/entities/project.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";

export interface ClientDetailsDTO {
  client: Client;
  contacts: ClientContact[];
  projects: Project[];
}

export class GetClientUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(idOrSlug: string): Promise<ClientDetailsDTO> {
    let client = await this.repo.findById(idOrSlug);
    if (!client) {
      client = await this.repo.findBySlug(idOrSlug);
    }
    if (!client) {
      throw new NotFoundError("Client", idOrSlug);
    }

    const [contacts, projects] = await Promise.all([
      this.repo.findContactsByClient(client.id),
      this.repo.findProjectsByClient(client.id),
    ]);

    return {
      client,
      contacts,
      projects,
    };
  }
}
