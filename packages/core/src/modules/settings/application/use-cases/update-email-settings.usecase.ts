import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import type { EmailSettings } from "../../domain/settings";

export class UpdateEmailSettingsUseCase {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(settings: Partial<EmailSettings> & { host: string; port: number; user: string }, actorId?: string): Promise<void> {
    const existing = await this.repo.getEmailSettings();
    const finalPassword = settings.pass && settings.pass.trim().length > 0 ? settings.pass : existing.pass;

    const updated: EmailSettings = {
      host: settings.host,
      port: settings.port,
      secure: settings.secure ?? false,
      user: settings.user,
      pass: finalPassword,
      fromName: settings.fromName || existing.fromName || "RapidShift Labs",
      fromEmail: settings.fromEmail || existing.fromEmail || settings.user,
    };

    await this.repo.saveEmailSettings(updated, actorId);
  }
}
