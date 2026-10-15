import { DrizzleEmbedRepository } from "./infrastructure/repositories/drizzle-embed.repository";
import type { IEmbedRepository } from "./domain/ports/embed-repository.port";
import { MintEmbedTokenUseCase } from "./application/use-cases/mint-embed-token.usecase";
import { VerifyEmbedTokenUseCase } from "./application/use-cases/verify-embed-token.usecase";

// Domain exports
export * from "./domain/constants/widget-catalog";
export * from "./domain/entities/embed-token.entity";
export * from "./domain/ports/embed-repository.port";

// Application exports
export * from "./application/dtos/embed.dto";
export * from "./application/use-cases/mint-embed-token.usecase";
export * from "./application/use-cases/verify-embed-token.usecase";

// Infrastructure exports
export * from "./infrastructure/repositories/drizzle-embed.repository";

export interface EmbedsModuleDependencies {
  embedRepo?: IEmbedRepository;
}

export class EmbedsModule {
  public readonly repo: IEmbedRepository;

  public readonly mintEmbedTokenUseCase: MintEmbedTokenUseCase;
  public readonly verifyEmbedTokenUseCase: VerifyEmbedTokenUseCase;

  constructor(deps?: EmbedsModuleDependencies) {
    this.repo = deps?.embedRepo ?? new DrizzleEmbedRepository();

    this.mintEmbedTokenUseCase = new MintEmbedTokenUseCase(this.repo);
    this.verifyEmbedTokenUseCase = new VerifyEmbedTokenUseCase(this.repo);
  }
}

let embedsModuleInstance: EmbedsModule | null = null;

export function getEmbedsModule(deps?: EmbedsModuleDependencies): EmbedsModule {
  if (!embedsModuleInstance || deps) {
    embedsModuleInstance = new EmbedsModule(deps);
  }
  return embedsModuleInstance;
}
