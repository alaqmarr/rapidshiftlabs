import { newId } from "../../../../shared/kernel/id";
import type { IChangelogRepository } from "../../domain/ports/changelog-repository.port";
import { GitHubCommitClassifier } from "../../domain/github-commit-classifier";
import type { SettingsRepository } from "../../../settings";
import type { ClientRepository } from "../../../clients";
import type { ProjectChangelogProps } from "../../domain/entities/project-changelog.entity";

export interface SyncChangelogResult {
  success: boolean;
  syncedCount: number;
  repo: string;
  branch: string;
  message: string;
}

export class SyncGitHubChangelogUseCase {
  constructor(
    private readonly changelogRepo: IChangelogRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly clientRepo: ClientRepository,
  ) {}

  async execute(params: {
    clientId: string;
    projectId?: string;
    repoOverride?: string;
    branchOverride?: string;
  }): Promise<SyncChangelogResult> {
    const { clientId, projectId, repoOverride, branchOverride } = params;

    // 1. Determine target repo and branch
    let repo = repoOverride?.trim();
    let branch = branchOverride?.trim() || "main";

    if (!repo) {
      const client = await this.clientRepo.findById(clientId);
      if (!client) {
        return {
          success: false,
          syncedCount: 0,
          repo: "",
          branch,
          message: `Client ${clientId} not found.`,
        };
      }
      repo = (client as any).githubRepo || "";
      branch = (client as any).githubBranch || branch;
    }

    if (!repo) {
      return {
        success: false,
        syncedCount: 0,
        repo: "",
        branch,
        message: "No GitHub repository mapped for this client or project.",
      };
    }

    // Clean up repo string e.g. "https://github.com/owner/repo" -> "owner/repo"
    repo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");

    // 2. Obtain global GitHub token
    const ghSettings = await this.settingsRepo.getGitHubSettings();
    const token = ghSettings.token || process.env.GITHUB_TOKEN || "";

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "RapidShift-Control-Panel",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      // 3. Fetch recent commits from GitHub
      const commitsUrl = `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(
        branch,
      )}&per_page=40`;
      const res = await fetch(commitsUrl, { headers });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        let msg = `GitHub API error ${res.status}`;
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.message) msg += `: ${errJson.message}`;
        } catch {
          // ignore
        }
        return {
          success: false,
          syncedCount: 0,
          repo,
          branch,
          message: msg,
        };
      }

      const commits = (await res.json()) as Array<{
        sha: string;
        html_url: string;
        commit: {
          message: string;
          author?: { name?: string; date?: string };
          committer?: { name?: string; date?: string };
        };
        author?: { avatar_url?: string; login?: string };
      }>;

      // 4. Also fetch GitHub releases for formal version tags/notes
      let releasesMap: Map<string, { name: string; body: string }> = new Map();
      try {
        const relRes = await fetch(
          `https://api.github.com/repos/${repo}/releases?per_page=15`,
          { headers },
        );
        if (relRes.ok) {
          const releasesData = (await relRes.json()) as Array<{
            tag_name: string;
            name: string;
            body: string;
          }>;
          for (const rel of releasesData) {
            releasesMap.set(rel.tag_name, { name: rel.name, body: rel.body });
          }
        }
      } catch {
        // Releases are optional enhancement
      }

      // 5. Classify and prepare new changelog rows
      const rowsToInsert: ProjectChangelogProps[] = [];
      const now = Date.now();

      for (const c of commits) {
        const rawMessage = c.commit.message || "";
        const classified = GitHubCommitClassifier.classify(rawMessage);

        // Omit internal technical chores from client visibility
        if (!classified.isClientVisible && classified.type === "chore") {
          continue;
        }

        const commitDateStr = c.commit.author?.date || c.commit.committer?.date;
        const committedAt = commitDateStr ? new Date(commitDateStr).getTime() : now;
        const authorName = c.author?.login || c.commit.author?.name || "Developer";
        const authorAvatarUrl = c.author?.avatar_url || null;

        // Check if there is a matching release description
        let finalDescription = classified.description;
        if (classified.versionTag && releasesMap.has(classified.versionTag)) {
          const relInfo = releasesMap.get(classified.versionTag)!;
          if (relInfo.body) finalDescription = relInfo.body;
        }

        rowsToInsert.push({
          id: newId("chg"),
          clientId,
          projectId: projectId || null,
          repo,
          commitSha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: rawMessage,
          title: classified.title,
          description: finalDescription,
          type: classified.type,
          authorName,
          authorAvatarUrl,
          commitUrl: c.html_url,
          versionTag: classified.versionTag,
          committedAt,
          createdAt: now,
        });
      }

      // 6. Save batch to SQLite
      await this.changelogRepo.saveBatch(rowsToInsert);

      return {
        success: true,
        syncedCount: rowsToInsert.length,
        repo,
        branch,
        message: `Synced ${rowsToInsert.length} client-facing updates from ${repo} (${branch}).`,
      };
    } catch (err: any) {
      return {
        success: false,
        syncedCount: 0,
        repo,
        branch,
        message: `Sync failed: ${err.message || String(err)}`,
      };
    }
  }
}
