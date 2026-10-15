import type { Client } from "../entities/client.entity";
import type { ClientContact } from "../entities/client-contact.entity";
import type { Project } from "../entities/project.entity";

export interface ListClientsQuery {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ClientRepository {
  create(client: Client): Promise<void>;
  update(client: Client): Promise<void>;
  findById(id: string): Promise<Client | null>;
  findBySlug(slug: string): Promise<Client | null>;
  list(query?: ListClientsQuery): Promise<{ items: Client[]; total: number }>;

  addContact(contact: ClientContact): Promise<void>;
  findContactsByClient(clientId: string): Promise<ClientContact[]>;
  deleteContact(id: string): Promise<void>;

  addProject(project: Project): Promise<void>;
  findProjectsByClient(clientId: string): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
}
