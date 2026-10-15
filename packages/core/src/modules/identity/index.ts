import { DrizzleAdminUserRepository } from "./infrastructure/repositories/drizzle-admin-user.repository";
import { DrizzleClientUserRepository } from "./infrastructure/repositories/drizzle-client-user.repository";
import { Argon2PasswordHasher } from "./infrastructure/crypto/argon2-password-hasher";
import { VerifyAdminCredentialsUseCase } from "./application/use-cases/verify-admin-credentials.usecase";
import { VerifyClientCredentialsUseCase } from "./application/use-cases/verify-client-credentials.usecase";
import { VerifyAdminTotpUseCase } from "./application/use-cases/verify-admin-totp.usecase";
import { RevokeUserSessionsUseCase } from "./application/use-cases/revoke-user-sessions.usecase";
import { CreateAdminUserUseCase } from "./application/use-cases/create-admin-user.usecase";
import { CreateClientUserUseCase } from "./application/use-cases/create-client-user.usecase";
import { ManageAdminUsersUseCase, type UpdateAdminUserInput } from "./application/use-cases/manage-admin-users.usecase";
import type { AdminUserRepository } from "./domain/repositories/admin-user-repository.port";
import type { ClientUserRepository } from "./domain/repositories/client-user-repository.port";
import type { Actor } from "../../shared/kernel/actor";

export * from "./domain/entities/admin-user.entity";
export * from "./domain/entities/client-user.entity";
export * from "./domain/value-objects/email.vo";
export * from "./domain/value-objects/password.vo";
export * from "./domain/value-objects/totp-secret.vo";
export * from "./domain/ports/password-hasher.port";
export * from "./domain/repositories/admin-user-repository.port";
export * from "./domain/repositories/client-user-repository.port";
export * from "./application/use-cases/verify-admin-credentials.usecase";
export * from "./application/use-cases/verify-client-credentials.usecase";
export * from "./application/use-cases/verify-admin-totp.usecase";
export * from "./application/use-cases/revoke-user-sessions.usecase";
export * from "./application/use-cases/create-admin-user.usecase";
export * from "./application/use-cases/create-client-user.usecase";
export * from "./application/use-cases/manage-admin-users.usecase";
export * from "./infrastructure/crypto/argon2-password-hasher";
export * from "./infrastructure/repositories/drizzle-admin-user.repository";
export * from "./infrastructure/repositories/drizzle-client-user.repository";

export class IdentityModule {
  public readonly adminRepo: AdminUserRepository;
  public readonly clientRepo: ClientUserRepository;
  public readonly hasher: Argon2PasswordHasher;

  public readonly verifyAdminCredentialsUseCase: VerifyAdminCredentialsUseCase;
  public readonly verifyClientCredentialsUseCase: VerifyClientCredentialsUseCase;
  public readonly verifyAdminTotpUseCase: VerifyAdminTotpUseCase;
  public readonly revokeUserSessionsUseCase: RevokeUserSessionsUseCase;
  public readonly createAdminUserUseCase: CreateAdminUserUseCase;
  public readonly createClientUserUseCase: CreateClientUserUseCase;
  public readonly manageAdminUsersUseCase: ManageAdminUsersUseCase;

  constructor(
    adminRepo?: AdminUserRepository,
    clientRepo?: ClientUserRepository,
  ) {
    this.adminRepo = adminRepo ?? new DrizzleAdminUserRepository();
    this.clientRepo = clientRepo ?? new DrizzleClientUserRepository();
    this.hasher = new Argon2PasswordHasher();

    this.verifyAdminCredentialsUseCase = new VerifyAdminCredentialsUseCase(
      this.adminRepo,
      this.hasher,
    );
    this.verifyClientCredentialsUseCase = new VerifyClientCredentialsUseCase(
      this.clientRepo,
      this.hasher,
    );
    this.verifyAdminTotpUseCase = new VerifyAdminTotpUseCase(this.adminRepo);
    this.revokeUserSessionsUseCase = new RevokeUserSessionsUseCase(
      this.adminRepo,
      this.clientRepo,
    );
    this.createAdminUserUseCase = new CreateAdminUserUseCase(
      this.adminRepo,
      this.hasher,
    );
    this.createClientUserUseCase = new CreateClientUserUseCase(
      this.clientRepo,
      this.hasher,
    );
    this.manageAdminUsersUseCase = new ManageAdminUsersUseCase(
      this.adminRepo,
      this.hasher,
    );
  }

  async verifyAdminCredentials(input: { email: string; password: string }) {
    return this.verifyAdminCredentialsUseCase.execute(input);
  }

  async verifyClientCredentials(input: { email: string; password: string }) {
    return this.verifyClientCredentialsUseCase.execute(input);
  }

  async verifyAdminTotp(input: { adminId: string; code: string; masterKey: string }) {
    return this.verifyAdminTotpUseCase.execute(input);
  }

  async revokeUserSessions(userId: string, realm: "admin" | "client") {
    return this.revokeUserSessionsUseCase.execute({ userId, realm });
  }

  async getSessionVersion(userId: string, realm: "admin" | "client"): Promise<number | null> {
    if (realm === "admin") {
      const user = await this.adminRepo.findById(userId);
      return user ? user.sessionVersion : null;
    } else {
      const user = await this.clientRepo.findById(userId);
      return user ? user.sessionVersion : null;
    }
  }

  async createAdminUser(input: {
    email: string;
    name: string;
    password: string;
    role: any;
    supportLevel?: 1 | 2 | 3 | null;
  }) {
    return this.createAdminUserUseCase.execute(input);
  }

  async createClientUser(input: {
    clientId: string;
    email: string;
    name: string;
    password: string;
    role?: any;
  }) {
    return this.createClientUserUseCase.execute(input);
  }

  async listAdminUsers(actor: Actor) {
    return this.manageAdminUsersUseCase.list(actor);
  }

  async getAdminUserById(id: string, actor: Actor) {
    return this.manageAdminUsersUseCase.getById(id, actor);
  }

  async updateAdminUser(input: UpdateAdminUserInput, actor: Actor) {
    return this.manageAdminUsersUseCase.update(input, actor);
  }

  async deleteAdminUser(id: string, actor: Actor) {
    return this.manageAdminUsersUseCase.delete(id, actor);
  }
}

let instance: IdentityModule | null = null;

export function getIdentityModule(): IdentityModule {
  if (!instance) {
    instance = new IdentityModule();
  }
  return instance;
}
