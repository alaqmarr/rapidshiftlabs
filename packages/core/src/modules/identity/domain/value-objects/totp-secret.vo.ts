export class TotpSecret {
  private static readonly BASE32_REGEX = /^[A-Z2-7]{16,64}$/;

  private constructor(private readonly _base32Secret: string) {}

  public static fromBase32(secret: string): TotpSecret {
    const cleaned = secret.trim().toUpperCase();
    if (!TotpSecret.BASE32_REGEX.test(cleaned)) {
      throw new Error("Invalid TOTP secret format: must be base32 string of 16-64 characters");
    }
    return new TotpSecret(cleaned);
  }

  public get secret(): string {
    return this._base32Secret;
  }
}
