import type { Incident } from "../entities/incident.entity";

export interface IncidentRepositoryPort {
  findById(id: string): Promise<Incident | null>;
  findActiveByDomainId(domainId: string): Promise<Incident | null>;
  findActiveByClientId(clientId: string): Promise<Incident[]>;
  findRecentByClientId(clientId: string, limit?: number): Promise<Incident[]>;
  save(incident: Incident): Promise<void>;
}
