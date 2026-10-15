import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";
import { Email } from "../../domain/value-objects/email.vo";
import type { AdminRole } from "../../../../shared/kernel/actor";

export interface VerifyAdminCredentialsInput {
  email: string;
  password: string;
}

export interface VerifyAdminCredentialsOutput {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    supportLevel: 1 | 2 | 3 | null;
    sessionVersion: number;
    totpEnabled: boolean;
  };
}

export class VerifyAdminCredentialsUseCase {
  constructor(
    private readonly adminRepo: AdminUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: VerifyAdminCredentialsInput): Promise<VerifyAdminCredentialsOutput> {
    try {
      const email = Email.create(input.email);
      const admin = await this.adminRepo.findByEmail(email);

      if (!admin) {
        return { success: false, error: "Invalid email or password" };
      }

      if (admin.status === "suspended") {
        return { success: false, error: "Account is suspended. Please contact your organization owner." };
      }

      const isValidPassword = await this.hasher.verify(admin.password.hash, input.password);
      if (!isValidPassword) {
        return { success: false, error: "Invalid email or password" };
      }

      admin.recordLogin();
      await this.adminRepo.save(admin);

      return {
        success: true,
        user: {
          id: admin.id,
          email: admin.email.value,
          name: admin.name,
          role: admin.role,
          supportLevel: admin.supportLevel,
          sessionVersion: admin.sessionVersion,
          totpEnabled: admin.totpEnabled,
        },
      };
    } catch {
      return { success: false, error: "Invalid email or password" };
    }
  }
}
