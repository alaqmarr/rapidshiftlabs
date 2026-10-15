import type { ClientUser } from "../entities/client-user.entity";
import type { Email } from "../value-objects/email.vo";

export interface ClientUserRepository {
  findById(id: string): Promise<ClientUser | null>;
  findByEmail(email: Email): Promise<ClientUser | null>;
  findByClientId(clientId: string): Promise<ClientUser[]>;
  save(user: ClientUser): Promise<void>;
  updateSessionVersion(id: string, newVersion: number): Promise<void>;
}
