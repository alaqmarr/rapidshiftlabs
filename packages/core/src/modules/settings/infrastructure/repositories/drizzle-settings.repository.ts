import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db/connection-factory";
import { settings, type SettingRow } from "../../../../shared/infrastructure/db/schema/settings";
import { AesGcmCipher } from "../../../../shared/infrastructure/crypto/aes-gcm-cipher";
import { getConfig } from "../../../../shared/config";
import type { SettingsRepository } from "../../domain/repositories/settings-repository.port";
import {
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_NUMBERING_SETTINGS,
  DEFAULT_DUNNING_SETTINGS,
  DEFAULT_GITHUB_SETTINGS,
  type CompanySettings,
  type EmailSettings,
  type NumberingSettings,
  type DunningSettings,
  type GitHubSettings,
} from "../../domain/settings";

export class DrizzleSettingsRepository implements SettingsRepository {
  private readonly db: LibSQLDatabase<any>;

  constructor(db?: LibSQLDatabase<any>) {
    this.db = db ?? getDb("core");
  }

  private getMasterKey(): string {
    return getConfig().MASTER_KEY;
  }

  private getPreviousMasterKey(): string | undefined {
    return getConfig().MASTER_KEY_PREVIOUS;
  }

  private async getSettingRaw(key: string): Promise<SettingRow | undefined> {
    const rows = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return rows[0];
  }

  private async upsertSetting(key: string, valueJson: string, encrypted: boolean, actorId?: string): Promise<void> {
    const now = Date.now();
    const existing = await this.getSettingRaw(key);
    if (existing) {
      await this.db
        .update(settings)
        .set({
          value: valueJson,
          encrypted,
          updatedBy: actorId ?? null,
          updatedAt: now,
        })
        .where(eq(settings.key, key));
    } else {
      await this.db.insert(settings).values({
        key,
        value: valueJson,
        encrypted,
        updatedBy: actorId ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async getCompanySettings(): Promise<CompanySettings> {
    const row = await this.getSettingRaw("company");
    if (!row) return DEFAULT_COMPANY_SETTINGS;
    try {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_COMPANY_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_COMPANY_SETTINGS;
    }
  }

  async saveCompanySettings(data: CompanySettings, actorId?: string): Promise<void> {
    await this.upsertSetting("company", JSON.stringify(data), false, actorId);
  }

  async getEmailSettings(): Promise<EmailSettings> {
    const row = await this.getSettingRaw("email");
    if (!row) return DEFAULT_EMAIL_SETTINGS;
    try {
      const parsed = JSON.parse(row.value);
      let pass = parsed.pass || "";
      if (row.encrypted && pass) {
        try {
          pass = AesGcmCipher.decrypt(
            pass,
            this.getMasterKey(),
            this.getPreviousMasterKey() || "12345678901234567890123456789012",
          );
        } catch (e) {
          console.error("[SettingsRepo] Failed to decrypt email password:", e);
        }
      }
      return {
        ...DEFAULT_EMAIL_SETTINGS,
        ...parsed,
        pass,
      };
    } catch {
      return DEFAULT_EMAIL_SETTINGS;
    }
  }

  async saveEmailSettings(data: EmailSettings, actorId?: string): Promise<void> {
    let encryptedPass = "";
    let isEncrypted = false;
    if (data.pass) {
      try {
        encryptedPass = AesGcmCipher.encrypt(data.pass, this.getMasterKey());
        isEncrypted = true;
      } catch (e) {
        console.error("[SettingsRepo] Encryption failed, saving plaintext as fallback:", e);
        encryptedPass = data.pass;
      }
    }
    const toStore = {
      ...data,
      pass: encryptedPass,
    };
    await this.upsertSetting("email", JSON.stringify(toStore), isEncrypted, actorId);
  }

  async getNumberingSettings(): Promise<NumberingSettings> {
    const row = await this.getSettingRaw("numbering");
    if (!row) return DEFAULT_NUMBERING_SETTINGS;
    try {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_NUMBERING_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_NUMBERING_SETTINGS;
    }
  }

  async saveNumberingSettings(data: NumberingSettings, actorId?: string): Promise<void> {
    await this.upsertSetting("numbering", JSON.stringify(data), false, actorId);
  }

  async incrementGstSequence(): Promise<number> {
    const current = await this.getNumberingSettings();
    const nextSeq = (current.nextGstSequence ?? 1) + 1;
    await this.saveNumberingSettings({ ...current, nextGstSequence: nextSeq });
    return current.nextGstSequence ?? 1;
  }

  async incrementNonGstSequence(): Promise<number> {
    const current = await this.getNumberingSettings();
    const nextSeq = (current.nextNonGstSequence ?? 1) + 1;
    await this.saveNumberingSettings({ ...current, nextNonGstSequence: nextSeq });
    return current.nextNonGstSequence ?? 1;
  }

  async getDunningSettings(): Promise<DunningSettings> {
    const row = await this.getSettingRaw("dunning");
    if (!row) return DEFAULT_DUNNING_SETTINGS;
    try {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_DUNNING_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_DUNNING_SETTINGS;
    }
  }

  async saveDunningSettings(data: DunningSettings, actorId?: string): Promise<void> {
    await this.upsertSetting("dunning", JSON.stringify(data), false, actorId);
  }

  async getGitHubSettings(): Promise<GitHubSettings> {
    const row = await this.getSettingRaw("github");
    const envToken = process.env.GITHUB_TOKEN || "";
    if (!row) {
      return {
        ...DEFAULT_GITHUB_SETTINGS,
        token: envToken,
      };
    }
    try {
      const parsed = JSON.parse(row.value);
      let token = parsed.token || envToken;
      if (row.encrypted && parsed.token) {
        try {
          token = AesGcmCipher.decrypt(parsed.token, this.getMasterKey(), this.getPreviousMasterKey());
        } catch (e) {
          console.error("[SettingsRepo] Failed to decrypt GitHub token:", e);
        }
      }
      return {
        ...DEFAULT_GITHUB_SETTINGS,
        ...parsed,
        token: token || envToken,
      };
    } catch {
      return {
        ...DEFAULT_GITHUB_SETTINGS,
        token: envToken,
      };
    }
  }

  async saveGitHubSettings(data: GitHubSettings, actorId?: string): Promise<void> {
    let encryptedToken = "";
    let isEncrypted = false;
    if (data.token) {
      try {
        encryptedToken = AesGcmCipher.encrypt(data.token, this.getMasterKey());
        isEncrypted = true;
      } catch (e) {
        console.error("[SettingsRepo] GitHub token encryption failed, fallback:", e);
        encryptedToken = data.token;
      }
    }
    const toStore = {
      ...data,
      token: encryptedToken,
    };
    await this.upsertSetting("github", JSON.stringify(toStore), isEncrypted, actorId);
  }
}
