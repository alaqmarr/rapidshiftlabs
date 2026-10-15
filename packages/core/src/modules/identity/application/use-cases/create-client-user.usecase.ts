import type { ClientUserRepository } from "../../domain/repositories/client-user-repository.port";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";
import { ClientUser } from "../../domain/entities/client-user.entity";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import type { ClientRole } from "../../../../shared/kernel/actor";

export interface CreateClientUserInput {
  clientId: string;
  email: string;
  name: string;
  password: string;
  role?: ClientRole;
}

export class CreateClientUserUseCase {
  constructor(
    private readonly clientRepo: ClientUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: CreateClientUserInput): Promise<ClientUser> {
    const email = Email.create(input.email);
    const existing = await this.clientRepo.findByEmail(email);
    if (existing) {
      if (existing.clientId === input.clientId) {
        const passwordHash = await this.hasher.hash(input.password);
        existing.updatePassword(Password.fromHash(passwordHash));
        existing.updateProfile({ name: input.name, role: input.role });
        existing.activate();
        await this.clientRepo.save(existing);
        return existing;
      }
      throw new Error(`Client user with email '${input.email}' is registered to another client organization`);
    }

    const passwordHash = await this.hasher.hash(input.password);
    const password = Password.fromHash(passwordHash);

    const user = ClientUser.create({
      clientId: input.clientId,
      email,
      name: input.name,
      password,
      role: input.role,
    });

    await this.clientRepo.save(user);
    return user;
  }
}
