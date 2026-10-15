import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type {
  CompanySettings,
  EmailSettings,
  NumberingSettings,
  DunningSettings,
} from "../../domain/settings";

export interface AllSettingsDTO {
  company: CompanySettings;
  email: Omit<EmailSettings, "pass"> & { hasPass: boolean };
  numbering: NumberingSettings;
  dunning: DunningSettings;
  github: {
    hasToken: boolean;
    tokenPreview?: string;
    defaultBranch: string;
    configuredAt?: number;
    lastTestedAt?: number;
    lastTestStatus?: "ok" | "error";
    lastTestMessage?: string;
    rateLimitRemaining?: number;
  };
}

export class GetSettingsUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(): Promise<AllSettingsDTO> {
    const [company, email, numbering, dunning, github] = await Promise.all([
      this.repo.getCompanySettings(),
      this.repo.getEmailSettings(),
      this.repo.getNumberingSettings(),
      this.repo.getDunningSettings(),
      this.repo.getGitHubSettings(),
    ]);

    const hasToken = Boolean(github.token && github.token.trim().length > 0);
    const tokenPreview = hasToken
      ? `${github.token.slice(0, 4)}...${github.token.slice(-4)}`
      : undefined;

    return {
      company,
      email: {
        host: email.host,
        port: email.port,
        secure: email.secure,
        user: email.user,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        hasPass: Boolean(email.pass && email.pass.length > 0),
      },
      numbering,
      dunning,
      github: {
        hasToken,
        tokenPreview,
        defaultBranch: github.defaultBranch || "main",
        configuredAt: github.configuredAt,
        lastTestedAt: github.lastTestedAt,
        lastTestStatus: github.lastTestStatus,
        lastTestMessage: github.lastTestMessage,
        rateLimitRemaining: github.rateLimitRemaining,
      },
    };
  }
}
