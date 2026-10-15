import { describe, it, expect, vi } from "vitest";
import { GetClientChangelogUseCase } from "../../../src/modules/releases/application/use-cases/get-client-changelog.usecase";
import type { IChangelogRepository } from "../../../src/modules/releases/domain/ports/changelog-repository.port";
import type { ClientRepository } from "../../../src/modules/clients/domain/repositories/client-repository.port";

describe("GetClientChangelogUseCase", () => {
  it("fetches and sorts client changelog items with client repository fallback", async () => {
    const mockChangelogRepo: IChangelogRepository = {
      findByClient: vi.fn().mockResolvedValue([
        {
          id: "chg_1",
          clientId: "cli_1",
          repo: "org/app",
          commitSha: "sha1",
          shortSha: "sha1",
          message: "feat: new billing module",
          title: "New billing module",
          type: "feature",
          authorName: "Eng",
          committedAt: 1000,
          isClientVisible: true,
          createdAt: 1000,
        },
      ]),
      findByProject: vi.fn().mockResolvedValue([]),
      saveBatch: vi.fn().mockResolvedValue(undefined),
      getLatestCommitSha: vi.fn().mockResolvedValue(null),
    };

    const mockClientRepo: Partial<ClientRepository> = {
      findById: vi.fn().mockResolvedValue({
        id: "cli_1",
        name: "Test Corp",
        githubRepo: "org/app",
        githubBranch: "main",
      } as any),
    };

    const useCase = new GetClientChangelogUseCase(
      mockChangelogRepo,
      mockClientRepo as ClientRepository,
    );

    const result = await useCase.execute({
      clientId: "cli_1",
      filterType: "all",
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("New billing module");
    expect(result.clientRepo).toBe("org/app");
    expect(result.clientBranch).toBe("main");
  });
});
