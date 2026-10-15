import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type { NumberingSettings } from "../../domain/settings";

export class UpdateNumberingSettingsUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(settings: NumberingSettings, actorId?: string): Promise<NumberingSettings> {
    await this.repo.saveNumberingSettings(settings, actorId);
    return this.repo.getNumberingSettings();
  }
}
