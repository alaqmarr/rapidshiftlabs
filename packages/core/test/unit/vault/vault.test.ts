import { describe, it, expect } from "vitest";
import { AesGcmCipher } from "../../../src/shared/infrastructure/crypto/aes-gcm-cipher";
import { VaultCredential } from "../../../src/modules/vault/domain/entities/vault-credential.entity";

describe("Vault & Zero-Knowledge Security", () => {
  const masterKey = "rsl_master_vault_encryption_key_32";

  it("encrypts secrets with random IV and authenticated tag via AES-256-GCM", () => {
    const secret = "postgres://usr_prod:SuperSecretPass123!@10.0.0.4:5432/app_db";

    const encrypted1 = AesGcmCipher.encrypt(secret, masterKey);
    const encrypted2 = AesGcmCipher.encrypt(secret, masterKey);

    // Random IV guarantee: same plaintext produces different ciphertexts
    expect(encrypted1).not.toBe(encrypted2);
    expect(encrypted1).not.toContain("SuperSecretPass123!");

    // Successfully decrypts back to identical plaintext
    const decrypted1 = AesGcmCipher.decrypt(encrypted1, masterKey);
    const decrypted2 = AesGcmCipher.decrypt(encrypted2, masterKey);

    expect(decrypted1).toBe(secret);
    expect(decrypted2).toBe(secret);
  });

  it("throws authentication error if ciphertext is tampered with", () => {
    const secret = "ghp_PersonalAccessTokenABC123456789";
    const encrypted = AesGcmCipher.encrypt(secret, masterKey);

    // Corrupt one character in the base64 ciphertext
    const tampered = encrypted.slice(0, -3) + "XYZ";
    expect(() => AesGcmCipher.decrypt(tampered, masterKey)).toThrow();
  });

  it("manages one-time reveal and expiration lifecycle on VaultCredential entity", () => {
    const encrypted = AesGcmCipher.encrypt("temp_smtp_pass", masterKey);
    const cred = VaultCredential.create({
      clientId: "cli_client_01",
      name: "Temporary SMTP Password",
      category: "smtp",
      encryptedValue: encrypted,
      oneTimeReveal: true,
    });

    expect(cred.oneTimeReveal).toBe(true);
    expect(cred.revealedCount).toBe(0);
    expect(cred.isExpired()).toBe(false);

    // First reveal
    cred.recordReveal();
    expect(cred.revealedCount).toBe(1);
    expect(cred.isExpired()).toBe(true); // Now marked expired because it was one-time reveal
  });
});
