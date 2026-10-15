import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export type ProjectStatus = "active" | "archived";

export interface ProjectProps {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string | null;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectParams {
  clientId: string;
  name: string;
  slug?: string;
  description?: string;
}

export class Project {
  private props: ProjectProps;

  constructor(props: ProjectProps) {
    if (!props.name || props.name.trim().length === 0) {
      throw new DomainRuleError("project_name_required", "Project name is required");
    }
    if (!props.slug || props.slug.trim().length === 0) {
      throw new DomainRuleError("project_slug_required", "Project slug is required");
    }
    this.props = { ...props };
  }

  static create(params: CreateProjectParams): Project {
    const now = Date.now();
    const slug =
      params.slug && params.slug.trim().length > 0
        ? params.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-")
        : params.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    return new Project({
      id: newId(ID_PREFIX.project),
      clientId: params.clientId,
      name: params.name.trim(),
      slug,
      description: params.description?.trim() || null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get name(): string {
    return this.props.name;
  }
  get slug(): string {
    return this.props.slug;
  }
  get description(): string | null | undefined {
    return this.props.description;
  }
  get status(): ProjectStatus {
    return this.props.status;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  archive(): void {
    this.props.status = "archived";
    this.props.updatedAt = Date.now();
  }

  toJSON(): ProjectProps {
    return { ...this.props };
  }
}
