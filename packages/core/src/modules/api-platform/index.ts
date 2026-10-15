import { DrizzleApiKeyRepository } from "./infrastructure/repositories/drizzle-api-key.repository";
import { DrizzleEventOutboxRepository } from "../../shared/infrastructure/events/outbox-repository";
import { uow, type IUnitOfWork } from "../../shared/infrastructure/db";
import { GenerateApiKeyCommand, type GenerateApiKeyInput } from "./application/commands/generate-api-key.command";
import { ValidateApiKeyQuery, type ValidateApiKeyInput } from "./application/queries/validate-api-key.query";
import { RevokeApiKeyCommand, type RevokeApiKeyInput } from "./application/commands/revoke-api-key.command";
import { ListApiKeysQuery, type ListApiKeysInput } from "./application/queries/list-api-keys.query";
import { JoseTokenSigner } from "./infrastructure/token/jose-token-signer";
import { TokenService } from "./application/services/token.service";
import type { IApiKeyRepository } from "./domain/repositories/api-key-repository.port";
import type { ITokenSigner } from "./domain/repositories/token-signer.port";
import type { AccessPassClaims, JWKS } from "./domain/value-objects/token-claims";
import type { Actor } from "../../shared/kernel/actor";

export * from "./domain/entities/api-key.entity";
export * from "./domain/value-objects/api-key-type";
export * from "./domain/value-objects/api-key-scopes";
export * from "./domain/value-objects/token-claims";
export * from "./domain/events/api-key.events";
export * from "./domain/repositories/api-key-repository.port";
export * from "./domain/repositories/token-signer.port";
export * from "./application/dtos/api-key.dto";
export * from "./application/commands/generate-api-key.command";
export * from "./application/commands/revoke-api-key.command";
export * from "./application/queries/validate-api-key.query";
export * from "./application/queries/list-api-keys.query";
export * from "./application/services/token.service";
export * from "./infrastructure/repositories/drizzle-api-key.repository";
export * from "./infrastructure/token/jose-token-signer";

export class ApiPlatformModule {
  public readonly apiKeyRepo: IApiKeyRepository;
  public readonly tokenSigner: ITokenSigner;
  public readonly tokenService: TokenService;
  public readonly generateApiKeyCommand: GenerateApiKeyCommand;
  public readonly revokeApiKeyCommand: RevokeApiKeyCommand;
  public readonly validateApiKeyQuery: ValidateApiKeyQuery;
  public readonly listApiKeysQuery: ListApiKeysQuery;

  // UseCase aliases for interoperability
  public readonly generateApiKeyUseCase: GenerateApiKeyCommand;
  public readonly validateApiKeyUseCase: ValidateApiKeyQuery;
  public readonly revokeApiKeyUseCase: RevokeApiKeyCommand;
  public readonly listApiKeysUseCase: ListApiKeysQuery;

  constructor(
    apiKeyRepo?: IApiKeyRepository,
    outboxRepo?: DrizzleEventOutboxRepository,
    unitOfWork?: IUnitOfWork,
    tokenSigner?: ITokenSigner,
  ) {
    const activeOutbox = outboxRepo ?? new DrizzleEventOutboxRepository();
    const activeUow = unitOfWork ?? uow;
    this.apiKeyRepo = apiKeyRepo ?? new DrizzleApiKeyRepository(undefined, activeOutbox, activeUow);
    this.tokenSigner = tokenSigner ?? new JoseTokenSigner();
    this.tokenService = new TokenService(this.tokenSigner);

    this.generateApiKeyCommand = new GenerateApiKeyCommand(this.apiKeyRepo);
    this.revokeApiKeyCommand = new RevokeApiKeyCommand(this.apiKeyRepo);
    this.validateApiKeyQuery = new ValidateApiKeyQuery(this.apiKeyRepo);
    this.listApiKeysQuery = new ListApiKeysQuery(this.apiKeyRepo);

    this.generateApiKeyUseCase = this.generateApiKeyCommand;
    this.validateApiKeyUseCase = this.validateApiKeyQuery;
    this.revokeApiKeyUseCase = this.revokeApiKeyCommand;
    this.listApiKeysUseCase = this.listApiKeysQuery;
  }

  async generateApiKey(input: GenerateApiKeyInput, actor?: Actor) {
    return this.generateApiKeyCommand.execute(input, actor);
  }

  async generateKey(input: GenerateApiKeyInput, actor?: Actor) {
    return this.generateApiKeyCommand.execute(input, actor);
  }

  async validateApiKey(input: string | ValidateApiKeyInput, requiredScopes?: string[]) {
    return this.validateApiKeyQuery.execute(input, requiredScopes);
  }

  async validateKey(rawKey: string, requiredScopes?: string[]) {
    return this.validateApiKeyQuery.execute(rawKey, requiredScopes);
  }

  async revokeApiKey(input: string | RevokeApiKeyInput, actor?: Actor) {
    return this.revokeApiKeyCommand.execute(input, actor);
  }

  async revokeKey(keyId: string, actor: Actor) {
    return this.revokeApiKeyCommand.execute(keyId, actor);
  }

  async listApiKeys(input: string | ListApiKeysInput, actor?: Actor) {
    return this.listApiKeysQuery.execute(input, actor);
  }

  async listKeys(clientId: string, actor: Actor) {
    return this.listApiKeysQuery.execute(clientId, actor);
  }

  async signAccessPass(claims: AccessPassClaims): Promise<string> {
    return this.tokenService.signAccessPass(claims);
  }

  async getPublicJwks(): Promise<JWKS> {
    return this.tokenService.getPublicJwks();
  }
}

let instance: ApiPlatformModule | null = null;

export function getApiPlatformModule(): ApiPlatformModule {
  if (!instance) {
    instance = new ApiPlatformModule();
  }
  return instance;
}
