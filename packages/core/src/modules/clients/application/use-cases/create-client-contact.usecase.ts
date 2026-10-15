import { ClientContact, type CreateClientContactParams } from "../../domain/entities/client-contact.entity";
import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class CreateClientContactUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(params: CreateClientContactParams): Promise<ClientContact> {
    const client = await this.repo.findById(params.clientId);
    if (!client) {
      throw new NotFoundError("Client", params.clientId);
    }

    const contact = ClientContact.create(params);
    await this.repo.addContact(contact);
    return contact;
  }
}
