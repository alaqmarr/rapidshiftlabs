import { DrizzleReleaseRepository } from "./infrastructure/repositories/drizzle-release.repository";
import { DrizzleChangelogRepository } from "./infrastructure/repositories/drizzle-changelog.repository";
import type { IReleaseRepository } from "./domain/ports/release-repository.port";
import type { IChangelogRepository } from "./domain/ports/changelog-repository.port";
import { CreateReleaseUseCase } from "./application/use-cases/create-release.usecase";
import { UpdateReleaseUseCase } from "./application/use-cases/update-release.usecase";
import { ListReleasesUseCase } from "./application/use-cases/list-releases.usecase";
import { DeleteReleaseUseCase } from "./application/use-cases/delete-release.usecase";
import { SyncGitHubChangelogUseCase } from "./application/use-cases/sync-github-changelog.usecase";
import { GetClientChangelogUseCase } from "./application/use-cases/get-client-changelog.usecase";
import { getSettingsModule, type SettingsRepository } from "../settings";
import { getClientsModule, type ClientRepository } from "../clients";

// Domain exports
export * from "./domain/entities/release-link.entity";
export * from "./domain/entities/project-changelog.entity";
export * from "./domain/ports/release-repository.port";
export * from "./domain/ports/changelog-repository.port";
export * from "./domain/github-commit-classifier";

// Application exports
export * from "./application/dtos/release.dto";
export * from "./application/use-cases/create-release.usecase";
export * from "./application/use-cases/update-release.usecase";
export * from "./application/use-cases/list-releases.usecase";
export * from "./application/use-cases/delete-release.usecase";
export * from "./application/use-cases/sync-github-changelog.usecase";
export * from "./application/use-cases/get-client-changelog.usecase";

// Infrastructure exports
export * from "./infrastructure/repositories/drizzle-release.repository";
export * from "./infrastructure/repositories/drizzle-changelog.repository";

export interface ReleasesModuleDependencies {
  releaseRepo?: IReleaseRepository;
  changelogRepo?: IChangelogRepository;
  settingsRepo?: SettingsRepository;
  clientRepo?: ClientRepository;
}

export class ReleasesModule {
  public readonly repo: IReleaseRepository;
  public readonly changelogRepo: IChangelogRepository;

  public readonly createReleaseUseCase: CreateReleaseUseCase;
  public readonly updateReleaseUseCase: UpdateReleaseUseCase;
  public readonly listReleasesUseCase: ListReleasesUseCase;
  public readonly deleteReleaseUseCase: DeleteReleaseUseCase;
  public readonly syncGitHubChangelogUseCase: SyncGitHubChangelogUseCase;
  public readonly getClientChangelogUseCase: GetClientChangelogUseCase;

  constructor(deps?: ReleasesModuleDependencies) {
    this.repo = deps?.releaseRepo ?? new DrizzleReleaseRepository();
    this.changelogRepo = deps?.changelogRepo ?? new DrizzleChangelogRepository();
    const settingsRepo = deps?.settingsRepo ?? getSettingsModule().repo;
    const clientRepo = deps?.clientRepo ?? getClientsModule().repo;

    this.createReleaseUseCase = new CreateReleaseUseCase(this.repo);
    this.updateReleaseUseCase = new UpdateReleaseUseCase(this.repo);
    this.listReleasesUseCase = new ListReleasesUseCase(this.repo);
    this.deleteReleaseUseCase = new DeleteReleaseUseCase(this.repo);
    this.syncGitHubChangelogUseCase = new SyncGitHubChangelogUseCase(
      this.changelogRepo,
      settingsRepo,
      clientRepo,
    );
    this.getClientChangelogUseCase = new GetClientChangelogUseCase(
      this.changelogRepo,
      clientRepo,
      this.syncGitHubChangelogUseCase,
    );
  }
}

let releasesModuleInstance: ReleasesModule | null = null;

export function getReleasesModule(deps?: ReleasesModuleDependencies): ReleasesModule {
  if (!releasesModuleInstance || deps) {
    releasesModuleInstance = new ReleasesModule(deps);
  }
  return releasesModuleInstance;
}
