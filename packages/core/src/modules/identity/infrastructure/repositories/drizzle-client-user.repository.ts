import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../../shared/infrastructure/db";
import { clientUsers } from "../../../../shared/infrastructure/db/schema/client-users";
import type { ClientUserRepository } from "../../domain/repositories/client-user-repository.port";
import { ClientUser } from "../../domain/entities/client-user.entity";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";

export class DrizzleClientUserRepository implements ClientUserRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async findById(id: string): Promise<ClientUser | null> {
    const rows = await this.db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByEmail(email: Email): Promise<ClientUser | null> {
    const rows = await this.db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.value))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByClientId(clientId: string): Promise<ClientUser[]> {
    const rows = await this.db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.clientId, clientId));

    return rows.map((r) => this.mapToEntity(r));
  }

  async save(user: ClientUser): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select({ id: clientUsers.id })
        .from(clientUsers)
        .where(eq(clientUsers.id, user.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(clientUsers)
          .set({
            clientId: user.clientId,
            email: user.email.value,
            name: user.name,
            role: user.role,
            passwordHash: user.password.hash,
            sessionVersion: user.sessionVersion,
            status: user.status,
            invitedAt: user.invitedAt ? user.invitedAt.getTime() : null,
            lastLoginAt: user.lastLoginAt ? user.lastLoginAt.getTime() : null,
            updatedAt: user.updatedAt.getTime(),
          })
          .where(eq(clientUsers.id, user.id));
      } else {
        await tx.insert(clientUsers).values({
          id: user.id,
          clientId: user.clientId,
          email: user.email.value,
          name: user.name,
          role: user.role,
          passwordHash: user.password.hash,
          sessionVersion: user.sessionVersion,
          status: user.status,
          invitedAt: user.invitedAt ? user.invitedAt.getTime() : null,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.getTime() : null,
          createdAt: user.createdAt.getTime(),
          updatedAt: user.updatedAt.getTime(),
        });
      }
    });
  }

  async updateSessionVersion(id: string, newVersion: number): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      await tx
        .update(clientUsers)
        .set({
          sessionVersion: newVersion,
          updatedAt: Date.now(),
        })
        .where(eq(clientUsers.id, id));
    });
  }

  private mapToEntity(row: typeof clientUsers.$inferSelect): ClientUser {
    return ClientUser.reconstitute({
      id: row.id,
      clientId: row.clientId,
      email: Email.create(row.email),
      name: row.name,
      password: Password.fromHash(row.passwordHash),
      role: row.role as any,
      sessionVersion: row.sessionVersion,
      status: row.status as any,
      invitedAt: row.invitedAt ? new Date(row.invitedAt) : null,
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
