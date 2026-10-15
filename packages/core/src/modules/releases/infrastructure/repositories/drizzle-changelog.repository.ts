import { eq, and, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db";
import { projectChangelogsTable } from "../../../../shared/infrastructure/db/schema/releases";
import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import type { IChangelogRepository } from "../../domain/ports/changelog-repository.port";
import type { ProjectChangelogProps } from "../../domain/entities/project-changelog.entity";

export class DrizzleChangelogRepository implements IChangelogRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async findByClient(
    clientId: string,
    filterType?: string,
    limit = 50,
  ): Promise<ProjectChangelogProps[]> {
    const conditions = [eq(projectChangelogsTable.clientId, clientId)];
    if (filterType && filterType !== "all") {
      conditions.push(eq(projectChangelogsTable.type, filterType as any));
    }

    const rows = await this.db
      .select()
      .from(projectChangelogsTable)
      .where(and(...conditions))
      .orderBy(desc(projectChangelogsTable.committedAt))
      .limit(limit);

    return rows.map((r) => this.mapToDomain(r));
  }

  async findByProject(
    projectId: string,
    filterType?: string,
    limit = 50,
  ): Promise<ProjectChangelogProps[]> {
    const conditions = [eq(projectChangelogsTable.projectId, projectId)];
    if (filterType && filterType !== "all") {
      conditions.push(eq(projectChangelogsTable.type, filterType as any));
    }

    const rows = await this.db
      .select()
      .from(projectChangelogsTable)
      .where(and(...conditions))
      .orderBy(desc(projectChangelogsTable.committedAt))
      .limit(limit);

    return rows.map((r) => this.mapToDomain(r));
  }

  async getLatestCommitSha(clientId: string, repo: string): Promise<string | null> {
    const rows = await this.db
      .select({ commitSha: projectChangelogsTable.commitSha })
      .from(projectChangelogsTable)
      .where(
        and(
          eq(projectChangelogsTable.clientId, clientId),
          eq(projectChangelogsTable.repo, repo),
        ),
      )
      .orderBy(desc(projectChangelogsTable.committedAt))
      .limit(1);

    return rows[0]?.commitSha ?? null;
  }

  async saveBatch(items: ProjectChangelogProps[]): Promise<void> {
    if (!items || items.length === 0) return;

    for (const item of items) {
      // Check if commit already recorded
      const existing = await this.db
        .select({ id: projectChangelogsTable.id })
        .from(projectChangelogsTable)
        .where(
          and(
            eq(projectChangelogsTable.clientId, item.clientId),
            eq(projectChangelogsTable.commitSha, item.commitSha),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await this.db.insert(projectChangelogsTable).values({
          id: item.id || newId(ID_PREFIX.changelog),
          clientId: item.clientId,
          projectId: item.projectId ?? null,
          repo: item.repo,
          commitSha: item.commitSha,
          shortSha: item.shortSha,
          message: item.message,
          title: item.title,
          description: item.description ?? null,
          type: item.type,
          authorName: item.authorName,
          authorAvatarUrl: item.authorAvatarUrl ?? null,
          commitUrl: item.commitUrl ?? null,
          versionTag: item.versionTag ?? null,
          committedAt: item.committedAt,
          createdAt: item.createdAt || Date.now(),
        });
      }
    }
  }

  private mapToDomain(r: any): ProjectChangelogProps {
    return {
      id: r.id,
      clientId: r.clientId,
      projectId: r.projectId,
      repo: r.repo,
      commitSha: r.commitSha,
      shortSha: r.shortSha,
      message: r.message,
      title: r.title,
      description: r.description,
      type: r.type,
      authorName: r.authorName,
      authorAvatarUrl: r.authorAvatarUrl,
      commitUrl: r.commitUrl,
      versionTag: r.versionTag,
      committedAt: r.committedAt,
      createdAt: r.createdAt,
    };
  }
}
