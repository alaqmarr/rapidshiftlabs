import { newId } from "../../../../shared/kernel/id";

export interface TicketMessageProps {
  id: string;
  ticketId: string;
  authorId: string;
  authorType: "admin" | "client" | "system";
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: number;
  updatedAt: number;
}

export class TicketMessage {
  constructor(public readonly props: TicketMessageProps) {}

  public static create(params: {
    id?: string;
    ticketId: string;
    authorId: string;
    authorType: "admin" | "client" | "system";
    authorName: string;
    body: string;
    isInternal?: boolean;
    createdAt?: number;
  }): TicketMessage {
    const now = params.createdAt ?? Date.now();
    return new TicketMessage({
      id: params.id ?? newId("tkm"),
      ticketId: params.ticketId,
      authorId: params.authorId,
      authorType: params.authorType,
      authorName: params.authorName,
      body: params.body,
      isInternal: params.isInternal ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get ticketId(): string {
    return this.props.ticketId;
  }
  public get authorId(): string {
    return this.props.authorId;
  }
  public get authorType(): "admin" | "client" | "system" {
    return this.props.authorType;
  }
  public get authorName(): string {
    return this.props.authorName;
  }
  public get body(): string {
    return this.props.body;
  }
  public get isInternal(): boolean {
    return this.props.isInternal;
  }
  public get createdAt(): number {
    return this.props.createdAt;
  }
}
