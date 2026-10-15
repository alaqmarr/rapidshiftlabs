import { eq, and, isNull, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { apiKeys, type ApiKeyRow } from "../../../../shared/infrastructure/db/schema/api-keys";
import { DrizzleEventOutboxRepository, type EventOutboxRepository } from "../../../../shared/infrastructure/events/outbox-repository";
import { ApiKey, type ApiKeyProps } from "../../domain/entities/api-key.entity";
import type { IApiKeyRepository, FindApiKeysOptions } from "../../domain/repositories/api-key-repository.port";

export class DrizzleApiKeyRepository implements IApiKeyRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly outboxRepo: EventOutboxRepository = new DrizzleEventOutboxRepository(),
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  private mapRowToEntity(row: ApiKeyRow): ApiKey {
    let parsedScopes: string[] = [];
    try {
      parsedScopes = JSON.parse(row.scopes);
    } catch {
      parsedScopes = [];
    }

    const props: ApiKeyProps = {
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      type: row.type as "secret" | "publishable",
      scopes: parsedScopes,
      expiresAt: row.expiresAt ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      revokedAt: row.revokedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    return ApiKey.reconstitute(props);
  }

  async findById(id: string): Promise<ApiKey | null> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]!);
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, keyPrefix));

    return rows.map((r) => this.mapRowToEntity(r));
  }

  async findActiveByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyPrefix, keyPrefix),
          isNull(apiKeys.revokedAt),
        ),
      );

    return rows.map((r) => this.mapRowToEntity(r));
  }

  async findByClientId(clientId: string, options?: FindApiKeysOptions): Promise<ApiKey[]> {
    const whereConditions = [eq(apiKeys.clientId, clientId)];
    if (!options?.includeRevoked) {
      whereConditions.push(isNull(apiKeys.revokedAt));
    }

    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(and(...whereConditions))
      .orderBy(desc(apiKeys.createdAt));

    return rows.map((r) => this.mapRowToEntity(r));
  }

  async save(apiKey: ApiKey, externalTx?: any): Promise<void> {
    const executeInTx = async (tx: any) => {
      const existing = await tx
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKey.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(apiKeys)
          .set({
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            keyHash: apiKey.keyHash,
            type: apiKey.type,
            scopes: JSON.stringify(apiKey.scopes),
            expiresAt: apiKey.expiresAt ?? null,
            lastUsedAt: apiKey.lastUsedAt ?? null,
            revokedAt: apiKey.revokedAt ?? null,
            updatedAt: apiKey.updatedAt,
          })
          .where(eq(apiKeys.id, apiKey.id));
      } else {
        await tx.insert(apiKeys).values({
          id: apiKey.id,
          clientId: apiKey.clientId,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          keyHash: apiKey.keyHash,
          type: apiKey.type,
          scopes: JSON.stringify(apiKey.scopes),
          expiresAt: apiKey.expiresAt ?? null,
          lastUsedAt: apiKey.lastUsedAt ?? null,
          revokedAt: apiKey.revokedAt ?? null,
          createdAt: apiKey.createdAt,
          updatedAt: apiKey.updatedAt,
        });
      }

      const events = apiKey.pullEvents();
      if (events.length > 0) {
        await this.outboxRepo.append(events, tx);
      }
    };

    if (externalTx) {
      await executeInTx(externalTx);
    } else {
      await this.uowInstance.runInTransaction("core", async (tx) => {
        await executeInTx(tx);
      });
    }
  }

  async create(apiKey: ApiKey): Promise<void> {
    return this.save(apiKey);
  }

  async update(apiKey: ApiKey): Promise<void> {
    return this.save(apiKey);
  }

  async updateLastUsed(id: string, lastUsedAt: number): Promise<void> {
    await this.uowInstance.runInTransaction("core", async (tx) => {
      await tx
        .update(apiKeys)
        .set({
          lastUsedAt,
          updatedAt: lastUsedAt,
        })
        .where(eq(apiKeys.id, id));
    });
  }

  async revoke(id: string, revokedAt: number): Promise<void> {
    await this.uowInstance.runInTransaction("core", async (tx) => {
      await tx
        .update(apiKeys)
        .set({
          revokedAt,
          updatedAt: revokedAt,
        })
        .where(eq(apiKeys.id, id));
    });
  }
}
