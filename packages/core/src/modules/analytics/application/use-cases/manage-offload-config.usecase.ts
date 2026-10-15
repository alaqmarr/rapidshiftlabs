import type {
  IAnalyticsRepository,
  AnalyticsOffloadConfig,
} from "../../domain/ports/analytics-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import { BadRequestError } from "../../../../shared/kernel/errors";
import { OffloadConfigSchema, type OffloadConfigDTO } from "../dtos/analytics.dto";

export class ManageOffloadConfigUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async get(clientId: string | null | undefined, actor: Actor): Promise<AnalyticsOffloadConfig | null> {
    assertCan(actor, "analytics:read");
    const targetClientId = scopeClientId(actor, clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required");
    }

    return this.repo.getOffloadConfig(targetClientId);
  }

  async update(input: OffloadConfigDTO, actor: Actor): Promise<AnalyticsOffloadConfig> {
    assertCan(actor, "analytics:write");
    const targetClientId = scopeClientId(actor, input.clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required");
    }

    const validated = OffloadConfigSchema.parse({
      ...input,
      clientId: targetClientId,
    });

    const now = Date.now();
    const existing = await this.repo.getOffloadConfig(targetClientId);

    const config: AnalyticsOffloadConfig = {
      clientId: targetClientId,
      endpointUrl: validated.endpointUrl,
      secret: validated.secret,
      enabled: validated.enabled,
      lastExportedAt: existing?.lastExportedAt ?? null,
      lastExportStatus: existing?.lastExportStatus ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repo.saveOffloadConfig(config);
    return config;
  }
}
