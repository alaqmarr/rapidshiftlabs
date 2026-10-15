export class Email {
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(private readonly _value: string) {}

  public static create(raw: string): Email {
    if (!raw || typeof raw !== "string") {
      throw new Error("Email must be a non-empty string");
    }
    const normalized = raw.trim().toLowerCase();
    if (!Email.EMAIL_REGEX.test(normalized)) {
      throw new Error(`Invalid email address: '${raw}'`);
    }
    return new Email(normalized);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: Email): boolean {
    return this._value === other._value;
  }

  public toString(): string {
    return this._value;
  }
}
