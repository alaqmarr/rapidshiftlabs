import type { IEmbedRepository } from "../../domain/ports/embed-repository.port";
import { WIDGET_CATALOG, type WidgetName } from "../../domain/constants/widget-catalog";
import { ForbiddenError, UnauthorizedError } from "../../../../shared/kernel/errors";
import type { EmbedToken } from "../../domain/entities/embed-token.entity";

export class VerifyEmbedTokenUseCase {
  constructor(private readonly repo: IEmbedRepository) {}

  async execute(
    tokenId: string,
    widgetName?: string,
    origin?: string,
  ): Promise<EmbedToken> {
    if (!tokenId) {
      throw new UnauthorizedError("Embed token is required");
    }

    const token = await this.repo.findById(tokenId);
    if (!token) {
      throw new UnauthorizedError("Invalid or unknown embed token");
    }

    if (token.isExpired()) {
      throw new UnauthorizedError("Embed token has expired");
    }

    if (!token.allowsOrigin(origin)) {
      throw new ForbiddenError(`Origin '${origin}' is not authorized for this embed token`);
    }

    if (widgetName) {
      const widgetDef = WIDGET_CATALOG[widgetName];
      if (widgetDef) {
        for (const reqScope of widgetDef.requiredScopes) {
          if (!token.hasScope(reqScope)) {
            throw new ForbiddenError(`Embed token lacks required scope '${reqScope}' for widget '${widgetName}'`);
          }
        }
      }
    }

    return token;
  }
}
