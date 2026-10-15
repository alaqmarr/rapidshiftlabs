import { eq, and, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db";
import { releaseLinksTable } from "../../../../shared/infrastructure/db/schema/releases";
import type { IReleaseRepository, ReleaseFilter } from "../../domain/ports/release-repository.port";
import { ReleaseLink, type ReleaseLinkProps, type ReleaseEnvironment, type ReleaseStatus } from "../../domain/entities/release-link.entity";

export class DrizzleReleaseRepository implements IReleaseRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async save(release: ReleaseLink): Promise<void> {
    const p = release.props;

    const existing = await this.db
      .select()
      .from(releaseLinksTable)
      .where(eq(releaseLinksTable.id, p.id))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(releaseLinksTable)
        .set({
          projectId: p.projectId,
          name: p.name,
          version: p.version,
          environment: p.environment,
          url: p.url,
          status: p.status,
          releaseNotes: p.releaseNotes,
          password: p.password,
          expiresAt: p.expiresAt,
          updatedAt: p.updatedAt,
        })
        .where(eq(releaseLinksTable.id, p.id));
    } else {
      await this.db.insert(releaseLinksTable).values({
        id: p.id,
        clientId: p.clientId,
        projectId: p.projectId,
        name: p.name,
        version: p.version,
        environment: p.environment,
        url: p.url,
        status: p.status,
        releaseNotes: p.releaseNotes,
        password: p.password,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }
  }

  async findById(id: string): Promise<ReleaseLink | null> {
    const rows = await this.db
      .select()
      .from(releaseLinksTable)
      .where(eq(releaseLinksTable.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return this.mapToEntity(r);
  }

  async list(filter?: ReleaseFilter): Promise<ReleaseLink[]> {
    const conditions: any[] = [];
    if (filter?.clientId) {
      conditions.push(eq(releaseLinksTable.clientId, filter.clientId));
    }
    if (filter?.projectId) {
      conditions.push(eq(releaseLinksTable.projectId, filter.projectId));
    }
    if (filter?.environment) {
      conditions.push(eq(releaseLinksTable.environment, filter.environment));
    }
    if (filter?.status) {
      conditions.push(eq(releaseLinksTable.status, filter.status));
    }

    let query = this.db
      .select()
      .from(releaseLinksTable)
      .orderBy(desc(releaseLinksTable.createdAt));

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    const rows = await query;
    return rows.map((r) => this.mapToEntity(r));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(releaseLinksTable).where(eq(releaseLinksTable.id, id));
  }

  private mapToEntity(r: any): ReleaseLink {
    const props: ReleaseLinkProps = {
      id: r.id,
      clientId: r.clientId,
      projectId: r.projectId,
      name: r.name,
      version: r.version,
      environment: r.environment as ReleaseEnvironment,
      url: r.url,
      status: r.status as ReleaseStatus,
      releaseNotes: r.releaseNotes,
      password: r.password,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
    return new ReleaseLink(props);
  }
}
