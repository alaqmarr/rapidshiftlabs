import { eq, lte } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db";
import { embedTokensTable } from "../../../../shared/infrastructure/db/schema/embeds";
import type { IEmbedRepository } from "../../domain/ports/embed-repository.port";
import { EmbedToken, type EmbedTokenProps } from "../../domain/entities/embed-token.entity";
import type { Permission } from "../../../../shared/kernel/actor";

export class DrizzleEmbedRepository implements IEmbedRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async save(token: EmbedToken): Promise<void> {
    const p = token.props;
    await this.db.insert(embedTokensTable).values({
      id: p.id,
      clientId: p.clientId,
      scopes: JSON.stringify(p.scopes),
      allowedOrigins: p.allowedOrigins.length > 0 ? JSON.stringify(p.allowedOrigins) : null,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
    });
  }

  async findById(id: string): Promise<EmbedToken | null> {
    const rows = await this.db
      .select()
      .from(embedTokensTable)
      .where(eq(embedTokensTable.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    let scopes: Permission[] = [];
    try {
      scopes = JSON.parse(r.scopes);
    } catch {
      scopes = [];
    }

    let allowedOrigins: string[] = [];
    if (r.allowedOrigins) {
      try {
        allowedOrigins = JSON.parse(r.allowedOrigins);
      } catch {
        allowedOrigins = r.allowedOrigins.split(",").map((s) => s.trim());
      }
    }

    const props: EmbedTokenProps = {
      id: r.id,
      clientId: r.clientId,
      scopes,
      allowedOrigins,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    };

    return new EmbedToken(props);
  }

  async deleteExpired(olderThanEpoch: number): Promise<number> {
    const res = await this.db
      .delete(embedTokensTable)
      .where(lte(embedTokensTable.expiresAt, olderThanEpoch));
    return (res as any)?.rowsAffected ?? 0;
  }
}
