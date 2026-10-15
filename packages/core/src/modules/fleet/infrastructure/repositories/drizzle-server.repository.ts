import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { servers, type ServerRow } from "../../../../shared/infrastructure/db/schema/fleet";
import type { ServerRepository } from "../../domain/repositories/server-repository.port";
import { Server, type ServerStatus } from "../../domain/entities/server.entity";

export class DrizzleServerRepository implements ServerRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly unitOfWork: IUnitOfWork = uow
  ) {}

  async findById(id: string): Promise<Server | null> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(eq(servers.id, id))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async findByHost(host: string): Promise<Server | null> {
    const rows = await this.db
      .select()
      .from(servers)
      .where(eq(servers.host, host))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async listAll(): Promise<Server[]> {
    const rows = await this.db.select().from(servers);
    return rows.map((r) => this.mapToEntity(r));
  }

  async save(server: Server): Promise<void> {
    await this.unitOfWork.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select({ id: servers.id })
        .from(servers)
        .where(eq(servers.id, server.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(servers)
          .set({
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            encryptedPrivateKey: server.encryptedPrivateKey,
            keyPassphraseEnc: server.keyPassphraseEnc,
            hostFingerprint: server.hostFingerprint,
            status: server.status,
            lastCheckedAt: server.lastCheckedAt ? server.lastCheckedAt.getTime() : null,
            errorMessage: server.errorMessage,
            updatedAt: server.updatedAt.getTime(),
          })
          .where(eq(servers.id, server.id));
      } else {
        await tx.insert(servers).values({
          id: server.id,
          name: server.name,
          host: server.host,
          port: server.port,
          username: server.username,
          encryptedPrivateKey: server.encryptedPrivateKey,
          keyPassphraseEnc: server.keyPassphraseEnc,
          hostFingerprint: server.hostFingerprint,
          status: server.status,
          lastCheckedAt: server.lastCheckedAt ? server.lastCheckedAt.getTime() : null,
          errorMessage: server.errorMessage,
          createdAt: server.createdAt.getTime(),
          updatedAt: server.updatedAt.getTime(),
        });
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.unitOfWork.runInTransaction("core", async (tx) => {
      await tx.delete(servers).where(eq(servers.id, id));
    });
  }

  private mapToEntity(row: ServerRow): Server {
    return Server.reconstitute({
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      encryptedPrivateKey: row.encryptedPrivateKey,
      keyPassphraseEnc: row.keyPassphraseEnc,
      hostFingerprint: row.hostFingerprint,
      status: row.status as ServerStatus,
      lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt) : null,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
