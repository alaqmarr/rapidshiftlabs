export class Password {
  private constructor(private readonly _hash: string) {}

  public static fromHash(hashedValue: string): Password {
    if (!hashedValue || !hashedValue.startsWith("$argon2id$")) {
      throw new Error("Invalid password hash format: must be an Argon2id PHC string");
    }
    return new Password(hashedValue);
  }

  public get hash(): string {
    return this._hash;
  }
}
