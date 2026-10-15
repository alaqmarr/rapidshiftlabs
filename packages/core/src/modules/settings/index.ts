import { DrizzleSettingsRepository } from "./infrastructure/repositories/drizzle-settings.repository";
import { NodemailerEmailSender } from "./infrastructure/email/nodemailer-email-sender";
import { GetSettingsUseCase } from "./application/use-cases/get-settings.usecase";
import { UpdateCompanySettingsUseCase } from "./application/use-cases/update-company-settings.usecase";
import { UpdateEmailSettingsUseCase } from "./application/use-cases/update-email-settings.usecase";
import { UpdateNumberingSettingsUseCase } from "./application/use-cases/update-numbering-settings.usecase";
import { SendTestEmailUseCase } from "./application/use-cases/send-test-email.usecase";
import { UpdateGitHubSettingsUseCase } from "./application/use-cases/update-github-settings.usecase";
import { TestGitHubConnectionUseCase } from "./application/use-cases/test-github-connection.usecase";
import type { SettingsRepository } from "./domain/repositories/settings-repository.port";

export * from "./domain/settings";
export * from "./domain/repositories/settings-repository.port";
export * from "./application/ports/email-sender.port";
export * from "./application/use-cases/get-settings.usecase";
export * from "./application/use-cases/update-company-settings.usecase";
export * from "./application/use-cases/update-email-settings.usecase";
export * from "./application/use-cases/update-numbering-settings.usecase";
export * from "./application/use-cases/send-test-email.usecase";
export * from "./application/use-cases/update-github-settings.usecase";
export * from "./application/use-cases/test-github-connection.usecase";
export * from "./infrastructure/repositories/drizzle-settings.repository";
export * from "./infrastructure/email/nodemailer-email-sender";
export * from "./infrastructure/email/email-templates";

export class SettingsModule {
  public readonly repo: SettingsRepository;
  public readonly emailSender: NodemailerEmailSender;

  public readonly getSettingsUseCase: GetSettingsUseCase;
  public readonly updateCompanySettingsUseCase: UpdateCompanySettingsUseCase;
  public readonly updateEmailSettingsUseCase: UpdateEmailSettingsUseCase;
  public readonly updateNumberingSettingsUseCase: UpdateNumberingSettingsUseCase;
  public readonly sendTestEmailUseCase: SendTestEmailUseCase;
  public readonly updateGitHubSettingsUseCase: UpdateGitHubSettingsUseCase;
  public readonly testGitHubConnectionUseCase: TestGitHubConnectionUseCase;

  constructor(repo?: SettingsRepository) {
    this.repo = repo ?? new DrizzleSettingsRepository();
    this.emailSender = new NodemailerEmailSender(this.repo);

    this.getSettingsUseCase = new GetSettingsUseCase(this.repo);
    this.updateCompanySettingsUseCase = new UpdateCompanySettingsUseCase(this.repo);
    this.updateEmailSettingsUseCase = new UpdateEmailSettingsUseCase(this.repo);
    this.updateNumberingSettingsUseCase = new UpdateNumberingSettingsUseCase(this.repo);
    this.sendTestEmailUseCase = new SendTestEmailUseCase(this.repo, this.emailSender);
    this.updateGitHubSettingsUseCase = new UpdateGitHubSettingsUseCase(this.repo);
    this.testGitHubConnectionUseCase = new TestGitHubConnectionUseCase(this.repo);
  }
}

let instance: SettingsModule | null = null;

export function getSettingsModule(): SettingsModule {
  if (!instance) {
    instance = new SettingsModule();
  }
  return instance;
}
