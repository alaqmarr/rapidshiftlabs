import { newId } from "../../../../shared/kernel/id";
import type { ChangelogType } from "../github-commit-classifier";

export interface ProjectChangelogProps {
  id: string;
  clientId: string;
  projectId?: string | null;
  repo: string;
  commitSha: string;
  shortSha: string;
  message: string;
  title: string;
  description?: string | null;
  type: ChangelogType;
  authorName: string;
  authorAvatarUrl?: string | null;
  commitUrl?: string | null;
  versionTag?: string | null;
  committedAt: number;
  createdAt: number;
}

export class ProjectChangelog {
  constructor(public readonly props: ProjectChangelogProps) {}

  public static create(
    params: Omit<ProjectChangelogProps, "id" | "createdAt" | "shortSha"> & {
      id?: string;
      createdAt?: number;
      shortSha?: string;
    },
  ): ProjectChangelog {
    const now = params.createdAt ?? Date.now();
    return new ProjectChangelog({
      ...params,
      id: params.id ?? newId("chg"),
      shortSha: params.shortSha ?? params.commitSha.slice(0, 7),
      description: params.description ?? null,
      projectId: params.projectId ?? null,
      authorAvatarUrl: params.authorAvatarUrl ?? null,
      commitUrl: params.commitUrl ?? null,
      versionTag: params.versionTag ?? null,
      createdAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get title(): string {
    return this.props.title;
  }
  public get type(): ChangelogType {
    return this.props.type;
  }
}
