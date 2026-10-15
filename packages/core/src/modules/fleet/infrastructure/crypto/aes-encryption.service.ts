import { AesGcmCipher } from "../../../../shared/infrastructure/crypto/aes-gcm-cipher";
import { getConfig } from "../../../../shared/config";
import type { EncryptionService } from "../../domain/ports/encryption-service.port";

export class AesEncryptionService implements EncryptionService {
  constructor(
    private readonly masterKey?: string,
    private readonly previousKey?: string
  ) {}

  private getEffectiveMasterKey(): string {
    return this.masterKey || getConfig().MASTER_KEY;
  }

  private getEffectivePreviousKey(): string | undefined {
    return this.previousKey !== undefined ? this.previousKey : getConfig().MASTER_KEY_PREVIOUS;
  }

  encrypt(plainText: string): string {
    return AesGcmCipher.encrypt(plainText, this.getEffectiveMasterKey());
  }

  decrypt(cipherText: string): string {
    return AesGcmCipher.decrypt(
      cipherText,
      this.getEffectiveMasterKey(),
      this.getEffectivePreviousKey()
    );
  }
}
