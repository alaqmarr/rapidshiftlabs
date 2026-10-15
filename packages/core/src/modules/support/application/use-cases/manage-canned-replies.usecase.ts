import { CannedReply } from "../../domain/entities/canned-reply.entity";
import type { ITicketRepository } from "../../domain/ports/ticket-repository.port";
import { type Actor, assertCan, isStaff } from "../../../../shared/kernel/actor";
import { ForbiddenError } from "../../../../shared/kernel/errors";

export class ManageCannedRepliesUseCase {
  constructor(private readonly repo: ITicketRepository) {}

  async create(
    input: { title: string; category: string; content: string; shortcut: string },
    actor: Actor,
  ): Promise<CannedReply> {
    assertCan(actor, "support:manage");
    if (!isStaff(actor)) {
      throw new ForbiddenError("Only staff can manage canned replies");
    }

    const reply = CannedReply.create(input);
    await this.repo.saveCannedReply(reply);
    return reply;
  }

  async list(category?: string, actor?: Actor): Promise<CannedReply[]> {
    if (actor) assertCan(actor, "support:read");
    return this.repo.listCannedReplies(category);
  }

  async delete(id: string, actor: Actor): Promise<void> {
    assertCan(actor, "support:manage");
    if (!isStaff(actor)) {
      throw new ForbiddenError("Only staff can delete canned replies");
    }
    await this.repo.deleteCannedReply(id);
  }
}
