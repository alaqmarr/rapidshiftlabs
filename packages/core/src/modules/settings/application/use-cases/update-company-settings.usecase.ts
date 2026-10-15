import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type { CompanySettings } from "../../domain/settings";
import {
  validatePincode,
  validateGstin,
  validatePan,
} from "../../../../shared/kernel/validation";

export class UpdateCompanySettingsUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(settings: CompanySettings, actorId?: string): Promise<CompanySettings> {
    if (!settings.legalName || settings.legalName.trim().length === 0) {
      throw new Error("Company legal business name is required.");
    }

    const country = settings.country || "India";
    if (settings.postalCode) {
      const pinRes = validatePincode(settings.postalCode, country);
      if (!pinRes.isValid) {
        throw new Error(pinRes.error);
      }
    }

    if (settings.gstin) {
      const gstinRes = validateGstin(settings.gstin, settings.state);
      if (!gstinRes.isValid) {
        throw new Error(gstinRes.error);
      }
    }

    if (settings.pan) {
      const panRes = validatePan(settings.pan, settings.gstin);
      if (!panRes.isValid) {
        throw new Error(panRes.error);
      }
    }

    await this.repo.saveCompanySettings(settings, actorId);
    return this.repo.getCompanySettings();
  }
}
