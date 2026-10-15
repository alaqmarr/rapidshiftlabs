import type { Server } from "../entities/server.entity";

export interface ServerRepository {
  findById(id: string): Promise<Server | null>;
  findByHost(host: string): Promise<Server | null>;
  listAll(): Promise<Server[]>;
  save(server: Server): Promise<void>;
  delete(id: string): Promise<void>;
}
