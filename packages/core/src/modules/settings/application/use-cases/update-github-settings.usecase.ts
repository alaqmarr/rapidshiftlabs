import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type { GitHubSettings } from "../../domain/settings";

export class UpdateGitHubSettingsUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(
    settings: {
      token?: string;
      defaultBranch?: string;
    },
    actorId?: string,
  ): Promise<GitHubSettings> {
    const existing = await this.repo.getGitHubSettings();
    const finalToken =
      settings.token !== undefined && settings.token.trim().length > 0
        ? settings.token.trim()
        : existing.token;

    const updated: GitHubSettings = {
      ...existing,
      token: finalToken,
      defaultBranch: settings.defaultBranch?.trim() || existing.defaultBranch || "main",
      configuredAt: finalToken ? Date.now() : undefined,
    };

    await this.repo.saveGitHubSettings(updated, actorId);
    return updated;
  }
}
