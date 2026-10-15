import type { IChangelogRepository } from "../../domain/ports/changelog-repository.port";
import type { SyncGitHubChangelogUseCase } from "./sync-github-changelog.usecase";
import type { ProjectChangelogProps } from "../../domain/entities/project-changelog.entity";
import type { ClientRepository } from "../../../clients";

export interface GetChangelogOptions {
  clientId: string;
  projectId?: string;
  filterType?: string; // "all" | "feature" | "fix" | "performance" | "release"
  limit?: number;
  autoSyncIfEmpty?: boolean;
}

export class GetClientChangelogUseCase {
  constructor(
    private readonly changelogRepo: IChangelogRepository,
    private readonly clientRepo: ClientRepository,
    private readonly syncUseCase?: SyncGitHubChangelogUseCase,
  ) {}

  async execute(options: GetChangelogOptions): Promise<{
    items: ProjectChangelogProps[];
    clientRepo?: string;
    clientBranch?: string;
  }> {
    const { clientId, projectId, filterType, limit = 50, autoSyncIfEmpty = true } = options;

    let items = projectId
      ? await this.changelogRepo.findByProject(projectId, filterType, limit)
      : await this.changelogRepo.findByClient(clientId, filterType, limit);

    // Get client's mapped repository info
    let clientRepoStr: string | undefined;
    let clientBranchStr: string | undefined;
    try {
      const client = await this.clientRepo.findById(clientId);
      if (client) {
        clientRepoStr = (client as any).githubRepo || undefined;
        clientBranchStr = (client as any).githubBranch || "main";
      }
    } catch {
      // ignore
    }

    // If no changelogs exist yet and client has a mapped repo, attempt one sync
    if (items.length === 0 && autoSyncIfEmpty && clientRepoStr && this.syncUseCase) {
      try {
        await this.syncUseCase.execute({
          clientId,
          projectId,
          repoOverride: clientRepoStr,
          branchOverride: clientBranchStr,
        });

        items = projectId
          ? await this.changelogRepo.findByProject(projectId, filterType, limit)
          : await this.changelogRepo.findByClient(clientId, filterType, limit);
      } catch {
        // fail-open
      }
    }

    return {
      items,
      clientRepo: clientRepoStr,
      clientBranch: clientBranchStr,
    };
  }
}
