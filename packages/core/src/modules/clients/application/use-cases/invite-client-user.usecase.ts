import type { ClientRepository } from "../../domain/repositories/client-repository.port";
import { NotFoundError } from "../../../../shared/kernel/errors";

export interface InviteClientUserInput {
  clientId: string;
  name: string;
  email: string;
  password?: string;
  role?: "client_admin" | "client_member";
}

export interface ClientUserInviterPort {
  createClientUser(input: {
    clientId: string;
    email: string;
    name: string;
    password: string;
    role?: "client_admin" | "client_member";
  }): Promise<{ id: string; email: string; name: string }>;
}

export interface ClientInvitationNotifierPort {
  sendInvitation(params: {
    clientName: string;
    userName: string;
    userEmail: string;
    tempPassword: string;
    role: string;
    portalUrl?: string;
  }): Promise<void>;
}

export class InviteClientUserUseCase {
  constructor(
    private readonly clientRepo: ClientRepository,
    private readonly inviter: ClientUserInviterPort,
    private readonly notifier?: ClientInvitationNotifierPort,
  ) {}

  async execute(input: InviteClientUserInput): Promise<{ id: string; email: string; name: string; password?: string; tempPassword?: string }> {
    const client = await this.clientRepo.findById(input.clientId);
    if (!client) {
      throw new NotFoundError("Client", input.clientId);
    }

    const tempPassword = input.password || `RapidShift@${Math.random().toString(36).slice(2, 8)}!`;

    const user = await this.inviter.createClientUser({
      clientId: input.clientId,
      email: input.email,
      name: input.name,
      password: tempPassword,
      role: input.role || "client_member",
    });

    if (this.notifier) {
      try {
        await this.notifier.sendInvitation({
          clientName: client.name,
          userName: input.name,
          userEmail: input.email,
          tempPassword,
          role: input.role || "client_member",
        });
        console.log(`[InviteClientUser] Dispatched invitation email to ${input.email} for client ${client.name}`);
      } catch (err) {
        console.error(`[InviteClientUser] Warning: Failed to send invitation email to ${input.email}:`, err);
      }
    }

    return {
      ...user,
      password: input.password || tempPassword,
      tempPassword,
    };
  }
}
