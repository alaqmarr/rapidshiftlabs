import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";
import { AdminUser } from "../../domain/entities/admin-user.entity";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import type { AdminRole, Actor } from "../../../../shared/kernel/actor";
import { assertCan, isSuperAdmin } from "../../../../shared/kernel/actor";
import { ForbiddenError } from "../../../../shared/kernel/errors";

export interface CreateAdminUserInput {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
  supportLevel?: 1 | 2 | 3 | null;
}

export class CreateAdminUserUseCase {
  constructor(
    private readonly adminRepo: AdminUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: CreateAdminUserInput, actor?: Actor): Promise<AdminUser> {
    if (actor) {
      assertCan(actor, "team:write");
      if (!isSuperAdmin(actor)) {
        throw new ForbiddenError("Only an Owner or SuperAdmin can create staff members");
      }
    }
    const email = Email.create(input.email);
    const existing = await this.adminRepo.findByEmail(email);
    if (existing) {
      throw new Error(`Admin with email '${input.email}' already exists`);
    }

    const passwordHash = await this.hasher.hash(input.password);
    const password = Password.fromHash(passwordHash);

    const admin = AdminUser.create({
      email,
      name: input.name,
      password,
      role: input.role,
      supportLevel: input.supportLevel,
    });

    await this.adminRepo.save(admin);
    return admin;
  }
}
