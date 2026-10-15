import type { Contract } from "../entities/contract.entity";

export interface ListContractsQuery {
  clientId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ContractRepository {
  create(contract: Contract): Promise<void>;
  update(contract: Contract): Promise<void>;
  findById(id: string): Promise<Contract | null>;
  findByCode(code: string): Promise<Contract | null>;
  list(query?: ListContractsQuery): Promise<{ items: Contract[]; total: number }>;
}
