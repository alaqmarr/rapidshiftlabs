import type { ReleaseLink, ReleaseEnvironment, ReleaseStatus } from "../entities/release-link.entity";

export interface ReleaseFilter {
  clientId?: string | null;
  projectId?: string | null;
  environment?: ReleaseEnvironment;
  status?: ReleaseStatus;
}

export interface IReleaseRepository {
  save(release: ReleaseLink): Promise<void>;
  findById(id: string): Promise<ReleaseLink | null>;
  list(filter?: ReleaseFilter): Promise<ReleaseLink[]>;
  delete(id: string): Promise<void>;
}
