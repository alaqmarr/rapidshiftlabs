import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) throw new Error("Invalid base32 character: " + cleaned[i]);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export class Rfc6238Totp {
  public static generateSecret(byteLength = 20): string {
    return base32Encode(randomBytes(byteLength));
  }

  public static generateOtpAuthUri(options: {
    secret: string;
    accountName: string;
    issuer?: string;
  }): string {
    const issuer = options.issuer ?? "RapidShift Labs";
    const label = encodeURIComponent(`${issuer}:${options.accountName}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${options.secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  public static generateToken(secret: string, timestampMs = Date.now()): string {
    const key = base32Decode(secret);
    const counter = Math.floor(timestampMs / 1000 / 30);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const hmac = createHmac("sha1", key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const binary =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);

    const otp = binary % 1_000_000;
    return otp.toString().padStart(6, "0");
  }

  public static verifyToken(options: {
    secret: string;
    token: string;
    window?: number;
    timestampMs?: number;
  }): boolean {
    const { secret, token, window = 1, timestampMs = Date.now() } = options;
    if (!token || !/^\d{6}$/.test(token)) return false;

    const currentCounter = Math.floor(timestampMs / 1000 / 30);
    for (let i = -window; i <= window; i++) {
      const stepMs = (currentCounter + i) * 30 * 1000;
      const expected = this.generateToken(secret, stepMs);
      if (expected === token) return true;
    }
    return false;
  }
}
