export type ProcessActionType = "restart" | "reload" | "logs" | "stop";
export type ProcessActionStatus = "pending" | "in_progress" | "success" | "failed";

export interface ProcessActionProps {
  id: string;
  processId: string;
  clientId: string | null;
  action: ProcessActionType;
  status: ProcessActionStatus;
  triggeredBy: string;
  outputExcerpt: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export class ProcessAction {
  private constructor(private readonly props: ProcessActionProps) {}

  static reconstitute(props: ProcessActionProps): ProcessAction {
    return new ProcessAction(props);
  }

  static create(params: {
    id: string;
    processId: string;
    clientId?: string | null;
    action: ProcessActionType;
    triggeredBy: string;
    status?: ProcessActionStatus;
  }): ProcessAction {
    return new ProcessAction({
      id: params.id,
      processId: params.processId,
      clientId: params.clientId ?? null,
      action: params.action,
      status: params.status ?? "pending",
      triggeredBy: params.triggeredBy,
      outputExcerpt: null,
      errorMessage: null,
      createdAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }
  get processId(): string {
    return this.props.processId;
  }
  get clientId(): string | null {
    return this.props.clientId;
  }
  get action(): ProcessActionType {
    return this.props.action;
  }
  get status(): ProcessActionStatus {
    return this.props.status;
  }
  get triggeredBy(): string {
    return this.props.triggeredBy;
  }
  get outputExcerpt(): string | null {
    return this.props.outputExcerpt;
  }
  get errorMessage(): string | null {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  complete(outputExcerpt?: string | null): void {
    this.props.status = "success";
    this.props.outputExcerpt = outputExcerpt ?? null;
  }

  fail(errorMessage: string, outputExcerpt?: string | null): void {
    this.props.status = "failed";
    this.props.errorMessage = errorMessage;
    this.props.outputExcerpt = outputExcerpt ?? null;
  }

  toSnapshot(): ProcessActionProps {
    return { ...this.props };
  }
}
