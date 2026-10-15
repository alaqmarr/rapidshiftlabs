import type { IVaultRepository, VaultFilter } from "../../domain/ports/vault-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import type { VaultCategory } from "../../domain/entities/vault-credential.entity";

export interface VaultMetadataDTO {
  id: string;
  clientId: string;
  projectId?: string | null;
  name: string;
  category: VaultCategory;
  username?: string | null;
  metadata?: any;
  expiresAt?: number | null;
  oneTimeReveal: boolean;
  revealedCount: number;
  lastRevealedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  isExpired: boolean;
}

export class ListCredentialsUseCase {
  constructor(private readonly repo: IVaultRepository) {}

  async execute(filter: VaultFilter, actor: Actor): Promise<VaultMetadataDTO[]> {
    assertCan(actor, "vault:read");
    const scopedClientId = scopeClientId(actor, filter.clientId);

    const credentials = await this.repo.list({
      ...filter,
      clientId: scopedClientId,
    });

    return credentials.map((c) => {
      let parsedMetadata: any = null;
      if (c.props.metadata) {
        try {
          parsedMetadata = JSON.parse(c.props.metadata);
        } catch {
          parsedMetadata = c.props.metadata;
        }
      }

      return {
        id: c.id,
        clientId: c.clientId,
        projectId: c.props.projectId,
        name: c.name,
        category: c.category,
        username: c.props.username,
        metadata: parsedMetadata,
        expiresAt: c.expiresAt,
        oneTimeReveal: c.oneTimeReveal,
        revealedCount: c.revealedCount,
        lastRevealedAt: c.props.lastRevealedAt,
        createdAt: c.props.createdAt,
        updatedAt: c.props.updatedAt,
        isExpired: c.isExpired(),
      };
    });
  }
}
