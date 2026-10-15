import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import type { ClientUserRepository } from "../../domain/repositories/client-user-repository.port";

export interface RevokeUserSessionsInput {
  userId: string;
  realm: "admin" | "client";
}

export interface RevokeUserSessionsOutput {
  success: boolean;
  newSessionVersion: number;
}

export class RevokeUserSessionsUseCase {
  constructor(
    private readonly adminRepo: AdminUserRepository,
    private readonly clientRepo: ClientUserRepository,
  ) {}

  async execute(input: RevokeUserSessionsInput): Promise<RevokeUserSessionsOutput> {
    if (input.realm === "admin") {
      const admin = await this.adminRepo.findById(input.userId);
      if (!admin) throw new Error(`Admin user not found: ${input.userId}`);
      const newVersion = admin.incrementSessionVersion();
      await this.adminRepo.updateSessionVersion(admin.id, newVersion);
      return { success: true, newSessionVersion: newVersion };
    } else {
      const clientUser = await this.clientRepo.findById(input.userId);
      if (!clientUser) throw new Error(`Client user not found: ${input.userId}`);
      const newVersion = clientUser.incrementSessionVersion();
      await this.clientRepo.updateSessionVersion(clientUser.id, newVersion);
      return { success: true, newSessionVersion: newVersion };
    }
  }
}
