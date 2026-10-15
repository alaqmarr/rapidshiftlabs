import type {
  CompanySettings,
  EmailSettings,
  NumberingSettings,
  DunningSettings,
  GitHubSettings,
} from "../settings";

export interface SettingsRepository {
  getCompanySettings(): Promise<CompanySettings>;
  saveCompanySettings(settings: CompanySettings, actorId?: string): Promise<void>;

  getEmailSettings(): Promise<EmailSettings>;
  saveEmailSettings(settings: EmailSettings, actorId?: string): Promise<void>;

  getNumberingSettings(): Promise<NumberingSettings>;
  saveNumberingSettings(settings: NumberingSettings, actorId?: string): Promise<void>;
  incrementGstSequence(): Promise<number>;
  incrementNonGstSequence(): Promise<number>;

  getDunningSettings(): Promise<DunningSettings>;
  saveDunningSettings(settings: DunningSettings, actorId?: string): Promise<void>;

  getGitHubSettings(): Promise<GitHubSettings>;
  saveGitHubSettings(settings: GitHubSettings, actorId?: string): Promise<void>;
}
