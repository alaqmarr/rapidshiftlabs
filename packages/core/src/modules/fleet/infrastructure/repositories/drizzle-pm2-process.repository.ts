import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { pm2Processes, type Pm2ProcessRow } from "../../../../shared/infrastructure/db/schema/fleet";
import { newId } from "../../../../shared/kernel/id";
import type {
  Pm2ProcessRepository,
  DiscoveredProcessData,
} from "../../domain/repositories/pm2-process-repository.port";
import { Pm2Process, type ProcessStatus } from "../../domain/entities/pm2-process.entity";

export class DrizzlePm2ProcessRepository implements Pm2ProcessRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly unitOfWork: IUnitOfWork = uow
  ) {}

  async findById(id: string): Promise<Pm2Process | null> {
    const rows = await this.db
      .select()
      .from(pm2Processes)
      .where(eq(pm2Processes.id, id))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async findByServerAndPm2Id(serverId: string, pm2Id: number): Promise<Pm2Process | null> {
    const rows = await this.db
      .select()
      .from(pm2Processes)
      .where(and(eq(pm2Processes.serverId, serverId), eq(pm2Processes.pm2Id, pm2Id)))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async listByServerId(serverId: string): Promise<Pm2Process[]> {
    const rows = await this.db
      .select()
      .from(pm2Processes)
      .where(eq(pm2Processes.serverId, serverId));

    return rows.map((r) => this.mapToEntity(r));
  }

  async listByClientId(clientId: string): Promise<Pm2Process[]> {
    const rows = await this.db
      .select()
      .from(pm2Processes)
      .where(eq(pm2Processes.clientId, clientId));

    return rows.map((r) => this.mapToEntity(r));
  }

  async listAll(): Promise<Pm2Process[]> {
    const rows = await this.db.select().from(pm2Processes);
    return rows.map((r) => this.mapToEntity(r));
  }

  async save(process: Pm2Process): Promise<void> {
    await this.unitOfWork.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select({ id: pm2Processes.id })
        .from(pm2Processes)
        .where(eq(pm2Processes.id, process.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(pm2Processes)
          .set({
            name: process.name,
            clientId: process.clientId,
            allowClientRestart: process.allowClientRestart,
            restartCooldownSec: process.restartCooldownSec,
            status: process.status as any,
            cpu: process.cpu,
            memory: process.memory,
            restarts: process.restarts,
            uptimeMs: process.uptimeMs,
            lastDiscoveredAt: process.lastDiscoveredAt.getTime(),
            updatedAt: process.updatedAt.getTime(),
          })
          .where(eq(pm2Processes.id, process.id));
      } else {
        await tx.insert(pm2Processes).values({
          id: process.id,
          serverId: process.serverId,
          pm2Id: process.pm2Id,
          name: process.name,
          clientId: process.clientId,
          allowClientRestart: process.allowClientRestart,
          restartCooldownSec: process.restartCooldownSec,
          status: process.status as any,
          cpu: process.cpu,
          memory: process.memory,
          restarts: process.restarts,
          uptimeMs: process.uptimeMs,
          lastDiscoveredAt: process.lastDiscoveredAt.getTime(),
          createdAt: process.createdAt.getTime(),
          updatedAt: process.updatedAt.getTime(),
        });
      }
    });
  }

  /**
   * Syncs discovered processes from PM2 without overwriting client mapping configuration.
   */
  async syncDiscoveredProcesses(
    serverId: string,
    discovered: DiscoveredProcessData[]
  ): Promise<Pm2Process[]> {
    return this.unitOfWork.runInTransaction("core", async (tx) => {
      const existingRows = await tx
        .select()
        .from(pm2Processes)
        .where(eq(pm2Processes.serverId, serverId));

      const matchedExistingIds = new Set<string>();
      const discoveredPm2Ids = new Set(discovered.map((d) => d.pm2Id));

      const now = Date.now();
      const synced: Pm2Process[] = [];

      for (const item of discovered) {
        // 1. Prefer exact pm2Id match; 2. Fallback to same process name if its old pm2Id is no longer present
        let existing = existingRows.find(
          (row) => row.pm2Id === item.pm2Id && !matchedExistingIds.has(row.id)
        );
        if (!existing) {
          existing = existingRows.find(
            (row) =>
              row.name === item.name &&
              !matchedExistingIds.has(row.id) &&
              !discoveredPm2Ids.has(row.pm2Id)
          );
        }

        if (existing) {
          matchedExistingIds.add(existing.id);
          // Update runtime data (including pm2Id if reassigned), PRESERVING clientId, allowClientRestart, restartCooldownSec
          await tx
            .update(pm2Processes)
            .set({
              pm2Id: item.pm2Id,
              name: item.name,
              status: item.status as any,
              cpu: item.cpu,
              memory: item.memory,
              restarts: item.restarts,
              uptimeMs: item.uptimeMs,
              lastDiscoveredAt: now,
              updatedAt: now,
            })
            .where(eq(pm2Processes.id, existing.id));

          synced.push(
            Pm2Process.reconstitute({
              id: existing.id,
              serverId,
              pm2Id: item.pm2Id,
              name: item.name,
              clientId: existing.clientId,
              allowClientRestart: Boolean(existing.allowClientRestart),
              restartCooldownSec: existing.restartCooldownSec,
              status: item.status as ProcessStatus,
              cpu: item.cpu,
              memory: item.memory,
              restarts: item.restarts,
              uptimeMs: item.uptimeMs,
              lastDiscoveredAt: new Date(now),
              createdAt: new Date(existing.createdAt),
              updatedAt: new Date(now),
            })
          );
        } else {
          // Insert new process
          const id = newId("prc");
          await tx.insert(pm2Processes).values({
            id,
            serverId,
            pm2Id: item.pm2Id,
            name: item.name,
            clientId: null,
            allowClientRestart: false,
            restartCooldownSec: 60,
            status: item.status as any,
            cpu: item.cpu,
            memory: item.memory,
            restarts: item.restarts,
            uptimeMs: item.uptimeMs,
            lastDiscoveredAt: now,
            createdAt: now,
            updatedAt: now,
          });

          synced.push(
            Pm2Process.reconstitute({
              id,
              serverId,
              pm2Id: item.pm2Id,
              name: item.name,
              clientId: null,
              allowClientRestart: false,
              restartCooldownSec: 60,
              status: item.status as ProcessStatus,
              cpu: item.cpu,
              memory: item.memory,
              restarts: item.restarts,
              uptimeMs: item.uptimeMs,
              lastDiscoveredAt: new Date(now),
              createdAt: new Date(now),
              updatedAt: new Date(now),
            })
          );
        }
      }

      // Prune stale/ghost processes that no longer exist in PM2 on this server
      for (const row of existingRows) {
        if (!matchedExistingIds.has(row.id)) {
          await tx.delete(pm2Processes).where(eq(pm2Processes.id, row.id));
        }
      }

      return synced;
    });
  }

  async delete(id: string): Promise<void> {
    await this.unitOfWork.runInTransaction("core", async (tx) => {
      await tx.delete(pm2Processes).where(eq(pm2Processes.id, id));
    });
  }

  private mapToEntity(row: Pm2ProcessRow): Pm2Process {
    return Pm2Process.reconstitute({
      id: row.id,
      serverId: row.serverId,
      pm2Id: row.pm2Id,
      name: row.name,
      clientId: row.clientId,
      allowClientRestart: Boolean(row.allowClientRestart),
      restartCooldownSec: row.restartCooldownSec,
      status: row.status as ProcessStatus,
      cpu: row.cpu,
      memory: row.memory,
      restarts: row.restarts,
      uptimeMs: row.uptimeMs ?? 0,
      lastDiscoveredAt: new Date(row.lastDiscoveredAt),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
