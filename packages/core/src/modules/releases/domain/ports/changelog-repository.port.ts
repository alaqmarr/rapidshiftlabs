import type { ProjectChangelogProps } from "../entities/project-changelog.entity";

export interface IChangelogRepository {
  findByClient(
    clientId: string,
    filterType?: string,
    limit?: number,
  ): Promise<ProjectChangelogProps[]>;

  findByProject(
    projectId: string,
    filterType?: string,
    limit?: number,
  ): Promise<ProjectChangelogProps[]>;

  saveBatch(items: ProjectChangelogProps[]): Promise<void>;

  getLatestCommitSha(clientId: string, repo: string): Promise<string | null>;
}
