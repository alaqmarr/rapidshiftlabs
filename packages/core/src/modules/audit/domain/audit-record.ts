import { newId } from "../../../shared/kernel/id";

export interface AuditRecordProps {
  id: string;
  actorId: string;
  actorType: "admin" | "client" | "system" | "api_key";
  actorEmail?: string | null;
  clientId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  timestamp: number;
}

export class AuditRecord {
  private constructor(private readonly props: AuditRecordProps) {}

  public static create(params: Omit<AuditRecordProps, "id" | "timestamp"> & { timestamp?: number }): AuditRecord {
    return new AuditRecord({
      id: newId("aud"),
      actorId: params.actorId,
      actorType: params.actorType,
      actorEmail: params.actorEmail ?? null,
      clientId: params.clientId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: params.details ?? null,
      timestamp: params.timestamp ?? Date.now(),
    });
  }

  public static reconstitute(props: AuditRecordProps): AuditRecord {
    return new AuditRecord(props);
  }

  public get id(): string { return this.props.id; }
  public get actorId(): string { return this.props.actorId; }
  public get actorType(): string { return this.props.actorType; }
  public get actorEmail(): string | null | undefined { return this.props.actorEmail; }
  public get clientId(): string | null | undefined { return this.props.clientId; }
  public get action(): string { return this.props.action; }
  public get entityType(): string { return this.props.entityType; }
  public get entityId(): string { return this.props.entityId; }
  public get ipAddress(): string | null | undefined { return this.props.ipAddress; }
  public get userAgent(): string | null | undefined { return this.props.userAgent; }
  public get details(): string | null | undefined { return this.props.details; }
  public get timestamp(): number { return this.props.timestamp; }

  public toJSON(): AuditRecordProps {
    return { ...this.props };
  }
}
