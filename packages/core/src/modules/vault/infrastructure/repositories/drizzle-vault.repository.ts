import { eq, and, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db";
import {
  vaultCredentialsTable,
} from "../../../../shared/infrastructure/db/schema/vault";
import type { IVaultRepository, VaultFilter } from "../../domain/ports/vault-repository.port";
import { VaultCredential, type VaultCredentialProps, type VaultCategory } from "../../domain/entities/vault-credential.entity";

export class DrizzleVaultRepository implements IVaultRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async save(credential: VaultCredential): Promise<void> {
    const p = credential.props;

    const existing = await this.db
      .select()
      .from(vaultCredentialsTable)
      .where(eq(vaultCredentialsTable.id, p.id))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(vaultCredentialsTable)
        .set({
          name: p.name,
          category: p.category,
          username: p.username,
          encryptedValue: p.encryptedValue,
          metadata: p.metadata,
          expiresAt: p.expiresAt,
          oneTimeReveal: p.oneTimeReveal,
          revealedCount: p.revealedCount,
          lastRevealedAt: p.lastRevealedAt,
          updatedAt: p.updatedAt,
        })
        .where(eq(vaultCredentialsTable.id, p.id));
    } else {
      await this.db.insert(vaultCredentialsTable).values({
        id: p.id,
        clientId: p.clientId,
        projectId: p.projectId,
        name: p.name,
        category: p.category,
        username: p.username,
        encryptedValue: p.encryptedValue,
        metadata: p.metadata,
        expiresAt: p.expiresAt,
        oneTimeReveal: p.oneTimeReveal,
        revealedCount: p.revealedCount,
        lastRevealedAt: p.lastRevealedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }
  }

  async findById(id: string): Promise<VaultCredential | null> {
    const rows = await this.db
      .select()
      .from(vaultCredentialsTable)
      .where(eq(vaultCredentialsTable.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return this.mapToEntity(r);
  }

  async list(filter?: VaultFilter): Promise<VaultCredential[]> {
    const conditions: any[] = [];
    if (filter?.clientId) {
      conditions.push(eq(vaultCredentialsTable.clientId, filter.clientId));
    }
    if (filter?.projectId) {
      conditions.push(eq(vaultCredentialsTable.projectId, filter.projectId));
    }
    if (filter?.category) {
      conditions.push(eq(vaultCredentialsTable.category, filter.category));
    }

    let query = this.db
      .select()
      .from(vaultCredentialsTable)
      .orderBy(desc(vaultCredentialsTable.createdAt));

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    const rows = await query;
    return rows.map((r) => this.mapToEntity(r));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(vaultCredentialsTable).where(eq(vaultCredentialsTable.id, id));
  }

  private mapToEntity(r: any): VaultCredential {
    const props: VaultCredentialProps = {
      id: r.id,
      clientId: r.clientId,
      projectId: r.projectId,
      name: r.name,
      category: r.category as VaultCategory,
      username: r.username,
      encryptedValue: r.encryptedValue,
      metadata: r.metadata,
      expiresAt: r.expiresAt,
      oneTimeReveal: Boolean(r.oneTimeReveal),
      revealedCount: r.revealedCount ?? 0,
      lastRevealedAt: r.lastRevealedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
    return new VaultCredential(props);
  }
}
