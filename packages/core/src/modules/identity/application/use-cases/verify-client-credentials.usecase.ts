import type { ClientUserRepository } from "../../domain/repositories/client-user-repository.port";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";
import { Email } from "../../domain/value-objects/email.vo";
import type { ClientRole } from "../../../../shared/kernel/actor";

export interface VerifyClientCredentialsInput {
  email: string;
  password: string;
}

export interface VerifyClientCredentialsOutput {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    clientId: string;
    email: string;
    name: string;
    role: ClientRole;
    sessionVersion: number;
  };
}

export class VerifyClientCredentialsUseCase {
  constructor(
    private readonly clientRepo: ClientUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async execute(input: VerifyClientCredentialsInput): Promise<VerifyClientCredentialsOutput> {
    try {
      const email = Email.create(input.email);
      const user = await this.clientRepo.findByEmail(email);

      if (!user || !user.isActive) {
        return { success: false, error: "Invalid email or password" };
      }

      const isValidPassword = await this.hasher.verify(user.password.hash, input.password);
      if (!isValidPassword) {
        return { success: false, error: "Invalid email or password" };
      }

      user.recordLogin();
      await this.clientRepo.save(user);

      return {
        success: true,
        user: {
          id: user.id,
          clientId: user.clientId,
          email: user.email.value,
          name: user.name,
          role: user.role,
          sessionVersion: user.sessionVersion,
        },
      };
    } catch {
      return { success: false, error: "Invalid email or password" };
    }
  }
}
