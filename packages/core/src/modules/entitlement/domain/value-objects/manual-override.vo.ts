import { invariant } from "../../../../shared/kernel/errors";

export type OverrideMode = "allow" | "block" | "maintenance";

export interface ManualOverrideProps {
  readonly mode: OverrideMode;
  readonly validUntil: number | null; // Epoch ms; null = indefinite until cleared
  readonly note: string | null;
  readonly setBy?: string | null;      // Actor id or label
  readonly createdAt: number;          // Epoch ms
}

export class ManualOverride {
  private constructor(private readonly props: ManualOverrideProps) {}

  static create(input: {
    mode: OverrideMode;
    validUntil?: number | null;
    note?: string | null;
    setBy?: string | null;
    now?: number;
  }): ManualOverride {
    const validModes: OverrideMode[] = ["allow", "block", "maintenance"];
    invariant(
      validModes.includes(input.mode),
      "invalid_override_mode",
      `Override mode must be one of: ${validModes.join(", ")}`,
    );

    const now = input.now ?? Date.now();
    if (input.validUntil !== null && input.validUntil !== undefined) {
      invariant(
        Number.isInteger(input.validUntil) && input.validUntil > now,
        "invalid_override_expiration",
        "Override validUntil must be a future epoch millisecond timestamp",
      );
    }

    return new ManualOverride({
      mode: input.mode,
      validUntil: input.validUntil ?? null,
      note: input.note ? input.note.trim() : null,
      setBy: input.setBy ?? null,
      createdAt: now,
    });
  }

  static reconstitute(props: ManualOverrideProps): ManualOverride {
    return new ManualOverride(props);
  }

  get mode(): OverrideMode {
    return this.props.mode;
  }

  get validUntil(): number | null {
    return this.props.validUntil;
  }

  get note(): string | null {
    return this.props.note;
  }

  get setBy(): string | null {
    return this.props.setBy ?? null;
  }

  get createdAt(): number {
    return this.props.createdAt;
  }

  isActive(now: number = Date.now()): boolean {
    if (this.props.validUntil === null) return true;
    return this.props.validUntil > now;
  }

  isExpired(now: number = Date.now()): boolean {
    return !this.isActive(now);
  }

  toState(): Readonly<ManualOverrideProps> {
    return Object.freeze({ ...this.props });
  }

  equals(other: ManualOverride | null | undefined): boolean {
    if (!other) return false;
    return (
      this.props.mode === other.mode &&
      this.props.validUntil === other.validUntil &&
      this.props.note === other.note
    );
  }
}
