import type { AdminUser } from "../entities/admin-user.entity";
import type { Email } from "../value-objects/email.vo";

export interface AdminUserRepository {
  findById(id: string): Promise<AdminUser | null>;
  findByEmail(email: Email): Promise<AdminUser | null>;
  save(admin: AdminUser): Promise<void>;
  updateSessionVersion(id: string, newVersion: number): Promise<void>;
  listAll(): Promise<AdminUser[]>;
  delete(id: string): Promise<void>;
}
