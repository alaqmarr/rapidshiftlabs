import { DrizzleClientRepository } from "./infrastructure/repositories/drizzle-client.repository";
import { CreateClientUseCase } from "./application/use-cases/create-client.usecase";
import { UpdateClientUseCase } from "./application/use-cases/update-client.usecase";
import { GetClientUseCase } from "./application/use-cases/get-client.usecase";
import { ListClientsUseCase } from "./application/use-cases/list-clients.usecase";
import { CreateClientContactUseCase } from "./application/use-cases/create-client-contact.usecase";
import { CreateProjectUseCase } from "./application/use-cases/create-project.usecase";
import {
  InviteClientUserUseCase,
  type ClientUserInviterPort,
  type ClientInvitationNotifierPort,
} from "./application/use-cases/invite-client-user.usecase";
import type { ClientRepository } from "./domain/repositories/client-repository.port";
import { getIdentityModule } from "../identity";
import { getSettingsModule, renderClientInvitationEmail } from "../settings";

export * from "./domain/entities/client.entity";
export * from "./domain/entities/client-contact.entity";
export * from "./domain/entities/project.entity";
export * from "./domain/repositories/client-repository.port";
export * from "./application/use-cases/create-client.usecase";
export * from "./application/use-cases/update-client.usecase";
export * from "./application/use-cases/get-client.usecase";
export * from "./application/use-cases/list-clients.usecase";
export * from "./application/use-cases/create-client-contact.usecase";
export * from "./application/use-cases/create-project.usecase";
export * from "./application/use-cases/invite-client-user.usecase";
export * from "./application/services/client-health.service";
export * from "./infrastructure/repositories/drizzle-client.repository";

export class ClientsModule {
  public readonly repo: ClientRepository;

  public readonly createClientUseCase: CreateClientUseCase;
  public readonly updateClientUseCase: UpdateClientUseCase;
  public readonly getClientUseCase: GetClientUseCase;
  public readonly listClientsUseCase: ListClientsUseCase;
  public readonly createContactUseCase: CreateClientContactUseCase;
  public readonly createProjectUseCase: CreateProjectUseCase;
  public readonly inviteClientUserUseCase: InviteClientUserUseCase;

  constructor(
    repo?: ClientRepository,
    inviter?: ClientUserInviterPort,
    notifier?: ClientInvitationNotifierPort,
  ) {
    this.repo = repo ?? new DrizzleClientRepository();

    this.createClientUseCase = new CreateClientUseCase(this.repo);
    this.updateClientUseCase = new UpdateClientUseCase(this.repo);
    this.getClientUseCase = new GetClientUseCase(this.repo);
    this.listClientsUseCase = new ListClientsUseCase(this.repo);
    this.createContactUseCase = new CreateClientContactUseCase(this.repo);
    this.createProjectUseCase = new CreateProjectUseCase(this.repo);

    const defaultInviter: ClientUserInviterPort = inviter ?? {
      async createClientUser(input) {
        const identity = getIdentityModule();
        const user = await identity.createClientUserUseCase.execute({
          clientId: input.clientId,
          email: input.email,
          name: input.name,
          password: input.password,
          role: input.role,
        });
        return { id: user.id, email: user.email.value, name: user.name };
      },
    };

    const defaultNotifier: ClientInvitationNotifierPort = notifier ?? {
      async sendInvitation(params) {
        try {
          const settingsModule = getSettingsModule();
          const companySettings = await settingsModule.repo.getCompanySettings();
          const emailSettings = await settingsModule.repo.getEmailSettings();
          const firmAddress = [
            companySettings.addressLine1,
            companySettings.city,
            companySettings.state,
            companySettings.country,
          ]
            .filter(Boolean)
            .join(", ");

          const portalBaseUrl =
            process.env.NEXTAUTH_URL ||
            process.env.APP_URL ||
            "http://localhost:3000";

          const rendered = renderClientInvitationEmail({
            clientName: params.clientName,
            userName: params.userName,
            userEmail: params.userEmail,
            tempPassword: params.tempPassword,
            role: params.role,
            portalUrl: `${portalBaseUrl}/portal/login`,
            firmName: companySettings.legalName || "RapidShift Labs",
            firmAddress: firmAddress || "Bengaluru, Karnataka, India",
            firmEmail:
              emailSettings.fromEmail ||
              emailSettings.user ||
              "support@rapidshiftlabs.com",
          });

          await settingsModule.emailSender.send({
            to: params.userEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
        } catch (err) {
          console.error(
            "[ClientsModule] Error dispatching client invitation email:",
            err,
          );
        }
      },
    };

    this.inviteClientUserUseCase = new InviteClientUserUseCase(
      this.repo,
      defaultInviter,
      defaultNotifier,
    );
  }
}

let instance: ClientsModule | null = null;

export function getClientsModule(): ClientsModule {
  if (!instance) {
    instance = new ClientsModule();
  }
  return instance;
}
