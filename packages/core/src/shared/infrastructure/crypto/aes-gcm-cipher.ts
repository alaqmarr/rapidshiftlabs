import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class AesGcmCipher {
  private static parseKey(key: string): Buffer {
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      return Buffer.from(key, "hex");
    }
    const buf = Buffer.from(key, "utf8");
    if (buf.length === 32) return buf;
    if (buf.length > 32) return buf.subarray(0, 32);
    // Pad if shorter than 32
    return Buffer.concat([buf, Buffer.alloc(32 - buf.length)]);
  }

  public static encrypt(plainText: string, masterKey: string): string {
    const key = this.parseKey(masterKey);
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: base64(iv:tag:ciphertext)
    return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  public static decrypt(cipherText: string, masterKey: string, previousKey?: string): string {
    const parts = cipherText.split(":");
    if (parts.length !== 3) throw new Error("Invalid ciphertext envelope format");

    const iv = Buffer.from(parts[0]!, "base64");
    const tag = Buffer.from(parts[1]!, "base64");
    const encrypted = Buffer.from(parts[2]!, "base64");

    try {
      const key = this.parseKey(masterKey);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted) + decipher.final("utf8");
    } catch (err) {
      if (previousKey) {
        const fallbackKey = this.parseKey(previousKey);
        const decipher = createDecipheriv("aes-256-gcm", fallbackKey, iv);
        decipher.setAuthTag(tag);
        return decipher.update(encrypted) + decipher.final("utf8");
      }
      throw err;
    }
  }
}
