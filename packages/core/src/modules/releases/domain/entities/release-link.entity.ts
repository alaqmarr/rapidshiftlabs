import { newId } from "../../../../shared/kernel/id";

export type ReleaseEnvironment = "beta" | "staging" | "prod";
export type ReleaseStatus = "active" | "archived" | "deprecated";

export interface ReleaseLinkProps {
  id: string;
  clientId: string;
  projectId?: string | null;
  name: string;
  version: string;
  environment: ReleaseEnvironment;
  url: string;
  status: ReleaseStatus;
  releaseNotes?: string | null;
  password?: string | null;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export class ReleaseLink {
  constructor(public readonly props: ReleaseLinkProps) {}

  public static create(params: {
    id?: string;
    clientId: string;
    projectId?: string | null;
    name: string;
    version: string;
    environment?: ReleaseEnvironment;
    url: string;
    status?: ReleaseStatus;
    releaseNotes?: string | null;
    password?: string | null;
    expiresAt?: number | null;
    createdAt?: number;
  }): ReleaseLink {
    const now = params.createdAt ?? Date.now();
    return new ReleaseLink({
      id: params.id ?? newId("rel"),
      clientId: params.clientId,
      projectId: params.projectId ?? null,
      name: params.name,
      version: params.version,
      environment: params.environment ?? "beta",
      url: params.url,
      status: params.status ?? "active",
      releaseNotes: params.releaseNotes ?? null,
      password: params.password ?? null,
      expiresAt: params.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get name(): string {
    return this.props.name;
  }
  public get version(): string {
    return this.props.version;
  }
  public get environment(): ReleaseEnvironment {
    return this.props.environment;
  }
  public get url(): string {
    return this.props.url;
  }
  public get status(): ReleaseStatus {
    return this.props.status;
  }

  public archive(now: number = Date.now()): void {
    this.props.status = "archived";
    this.props.updatedAt = now;
  }

  public update(
    params: Partial<
      Pick<
        ReleaseLinkProps,
        "name" | "version" | "environment" | "url" | "status" | "releaseNotes" | "password" | "expiresAt"
      >
    >,
    now: number = Date.now(),
  ): void {
    Object.assign(this.props, params);
    this.props.updatedAt = now;
  }
}
