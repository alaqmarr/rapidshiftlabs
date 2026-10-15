import type { EmbedToken } from "../entities/embed-token.entity";

export interface IEmbedRepository {
  save(token: EmbedToken): Promise<void>;
  findById(id: string): Promise<EmbedToken | null>;
  deleteExpired(olderThanEpoch: number): Promise<number>;
}
