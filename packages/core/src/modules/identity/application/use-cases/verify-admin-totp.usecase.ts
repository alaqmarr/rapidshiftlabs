import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import { AesGcmCipher } from "../../../../shared/infrastructure/crypto/aes-gcm-cipher";
import { Rfc6238Totp } from "../../../../shared/infrastructure/crypto/rfc6238-totp";

export interface VerifyAdminTotpInput {
  adminId: string;
  code: string;
  masterKey: string;
}

export class VerifyAdminTotpUseCase {
  constructor(private readonly adminRepo: AdminUserRepository) {}

  async execute(input: VerifyAdminTotpInput): Promise<{ success: boolean; error?: string }> {
    const admin = await this.adminRepo.findById(input.adminId);
    if (!admin) return { success: false, error: "Admin user not found" };
    if (!admin.totpEnabled || !admin.totpSecretEnc) {
      return { success: false, error: "TOTP 2FA is not enabled for this user" };
    }

    try {
      const secret = AesGcmCipher.decrypt(admin.totpSecretEnc, input.masterKey);
      const isValid = Rfc6238Totp.verifyToken({
        secret,
        token: input.code,
        window: 1,
      });

      if (!isValid) return { success: false, error: "Invalid authenticator code" };
      return { success: true };
    } catch {
      return { success: false, error: "Failed to verify authenticator code" };
    }
  }
}
