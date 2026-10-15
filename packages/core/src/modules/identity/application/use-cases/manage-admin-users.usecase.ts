import type { AdminUserRepository } from "../../domain/repositories/admin-user-repository.port";
import type { IPasswordHasher } from "../../domain/ports/password-hasher.port";
import { Password } from "../../domain/value-objects/password.vo";
import {
  type Actor,
  assertCan,
  isSuperAdmin,
} from "../../../../shared/kernel/actor";
import { ForbiddenError, NotFoundError } from "../../../../shared/kernel/errors";
import type { AdminRole } from "../../../../shared/kernel/actor";
import type { AdminUserStatus } from "../../domain/entities/admin-user.entity";

export interface UpdateAdminUserInput {
  id: string;
  name?: string;
  role?: AdminRole;
  supportLevel?: 1 | 2 | 3 | null;
  status?: AdminUserStatus;
  password?: string;
}

export class ManageAdminUsersUseCase {
  constructor(
    private readonly adminRepo: AdminUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async list(actor: Actor) {
    assertCan(actor, "team:read");
    const all = await this.adminRepo.listAll();
    return all.map((user) => user.toState());
  }

  async getById(id: string, actor: Actor) {
    assertCan(actor, "team:read");
    const user = await this.adminRepo.findById(id);
    if (!user) {
      throw new NotFoundError("AdminUser", id);
    }
    return user.toState();
  }

  async update(input: UpdateAdminUserInput, actor: Actor) {
    assertCan(actor, "team:write");

    const targetUser = await this.adminRepo.findById(input.id);
    if (!targetUser) {
      throw new NotFoundError("AdminUser", input.id);
    }

    // Role modification & user status changes are restricted to SuperAdmins / Owners
    if (input.role && input.role !== targetUser.role) {
      if (!isSuperAdmin(actor)) {
        throw new ForbiddenError("Only an Owner or SuperAdmin can modify staff roles");
      }
    }

    // Protect last owner from demotion or suspension
    if (targetUser.role === "owner" && (input.role !== "owner" || input.status === "suspended")) {
      const allAdmins = await this.adminRepo.listAll();
      const activeOwners = allAdmins.filter(
        (a) => a.role === "owner" && a.status === "active" && a.id !== targetUser.id,
      );
      if (activeOwners.length === 0) {
        throw new ForbiddenError("Cannot suspend or change role of the sole remaining Owner");
      }
    }

    // Apply profile updates
    targetUser.updateProfile({
      name: input.name,
      role: input.role,
      supportLevel: input.supportLevel,
    });

    // Apply status change
    if (input.status) {
      if (input.status === "suspended") {
        targetUser.suspend();
      } else if (input.status === "active") {
        targetUser.activate();
      }
    }

    // Apply password change if provided
    if (input.password && input.password.trim()) {
      const hash = await this.hasher.hash(input.password.trim());
      targetUser.updatePassword(Password.fromHash(hash));
    }

    await this.adminRepo.save(targetUser);
    return targetUser.toState();
  }

  async delete(id: string, actor: Actor) {
    assertCan(actor, "team:write");
    if (!isSuperAdmin(actor)) {
      throw new ForbiddenError("Only an Owner or SuperAdmin can remove staff members");
    }

    const targetUser = await this.adminRepo.findById(id);
    if (!targetUser) {
      throw new NotFoundError("AdminUser", id);
    }

    // Cannot delete oneself
    const actorId = (actor as any).id;
    if (actorId && actorId === id) {
      throw new ForbiddenError("You cannot delete your own account");
    }

    // Cannot delete the last owner
    if (targetUser.role === "owner") {
      const allAdmins = await this.adminRepo.listAll();
      const otherOwners = allAdmins.filter((a) => a.role === "owner" && a.id !== id);
      if (otherOwners.length === 0) {
        throw new ForbiddenError("Cannot delete the sole remaining Owner");
      }
    }

    await this.adminRepo.delete(id);
    return { success: true, deletedId: id };
  }
}
