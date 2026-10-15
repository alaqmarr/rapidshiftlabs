import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../../shared/infrastructure/db";
import { adminUsers } from "../../../../shared/infrastructure/db/schema/admin-users";
import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import { AdminUser } from "../../domain/entities/admin-user.entity";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";

export class DrizzleAdminUserRepository implements AdminUserRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async findById(id: string): Promise<AdminUser | null> {
    const rows = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByEmail(email: Email): Promise<AdminUser | null> {
    const rows = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email.value))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async save(admin: AdminUser): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, admin.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(adminUsers)
          .set({
            email: admin.email.value,
            name: admin.name,
            role: admin.role,
            supportLevel: admin.supportLevel,
            status: admin.status,
            passwordHash: admin.password.hash,
            totpSecretEnc: admin.totpSecretEnc,
            totpEnabled: admin.totpEnabled,
            sessionVersion: admin.sessionVersion,
            lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.getTime() : null,
            updatedAt: admin.updatedAt.getTime(),
          })
          .where(eq(adminUsers.id, admin.id));
      } else {
        await tx.insert(adminUsers).values({
          id: admin.id,
          email: admin.email.value,
          name: admin.name,
          role: admin.role,
          supportLevel: admin.supportLevel,
          status: admin.status,
          passwordHash: admin.password.hash,
          totpSecretEnc: admin.totpSecretEnc,
          totpEnabled: admin.totpEnabled,
          sessionVersion: admin.sessionVersion,
          lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.getTime() : null,
          createdAt: admin.createdAt.getTime(),
          updatedAt: admin.updatedAt.getTime(),
        });
      }
    });
  }

  async updateSessionVersion(id: string, newVersion: number): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      await tx
        .update(adminUsers)
        .set({
          sessionVersion: newVersion,
          updatedAt: Date.now(),
        })
        .where(eq(adminUsers.id, id));
    });
  }

  async delete(id: string): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      await tx.delete(adminUsers).where(eq(adminUsers.id, id));
    });
  }

  async listAll(): Promise<AdminUser[]> {
    const rows = await this.db.select().from(adminUsers);
    return rows.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(row: typeof adminUsers.$inferSelect): AdminUser {
    return AdminUser.reconstitute({
      id: row.id,
      email: Email.create(row.email),
      name: row.name,
      password: Password.fromHash(row.passwordHash),
      role: row.role as any,
      supportLevel: row.supportLevel as any,
      status: (row.status as any) || "active",
      totpSecretEnc: row.totpSecretEnc,
      totpEnabled: Boolean(row.totpEnabled),
      sessionVersion: row.sessionVersion,
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
  }
}
