import { EmbedToken } from "../../domain/entities/embed-token.entity";
import type { IEmbedRepository } from "../../domain/ports/embed-repository.port";
import { MintEmbedTokenSchema, type MintEmbedTokenDTO } from "../dtos/embed.dto";
import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";

export class MintEmbedTokenUseCase {
  constructor(private readonly repo: IEmbedRepository) {}

  async execute(input: MintEmbedTokenDTO, actor: Actor): Promise<EmbedToken> {
    assertCan(actor, "embeds:create");
    assertTenant(actor, input.clientId);

    const validated = MintEmbedTokenSchema.parse(input);

    const token = EmbedToken.create({
      clientId: validated.clientId,
      scopes: validated.scopes,
      allowedOrigins: validated.allowedOrigins,
      ttlMs: validated.ttlMs,
    });

    await this.repo.save(token);
    return token;
  }
}
