import { eq, or, count, desc, like } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db/connection-factory";
import {
  contracts,
  contractItems,
  type ContractRow,
  type ContractItemRow,
} from "../../../../shared/infrastructure/db/schema/contracts";
import {
  Contract,
  type ContractStatus,
  type BillingCycle,
  type TaxProfile,
} from "../../domain/entities/contract.entity";
import { ContractItem } from "../../domain/entities/contract-item.entity";
import type {
  ContractRepository,
  ListContractsQuery,
} from "../../domain/repositories/contract-repository.port";

export class DrizzleContractRepository implements ContractRepository {
  private readonly db: LibSQLDatabase<any>;

  constructor(db?: LibSQLDatabase<any>) {
    this.db = db ?? getDb("core");
  }

  private toDomain(contractRow: ContractRow, itemRows: ContractItemRow[]): Contract {
    const items = itemRows.map(
      (it) =>
        new ContractItem({
          id: it.id,
          contractId: it.contractId,
          description: it.description,
          amountMinor: it.amountMinor,
          quantity: it.quantity,
          createdAt: it.createdAt,
          updatedAt: it.updatedAt,
        }),
    );

    return new Contract({
      id: contractRow.id,
      clientId: contractRow.clientId,
      code: contractRow.code,
      title: contractRow.title,
      status: (contractRow.status as ContractStatus) || "draft",
      amountMinor: contractRow.amountMinor,
      currency: contractRow.currency || "INR",
      billingCycle: (contractRow.billingCycle as BillingCycle) || "monthly",
      intervalCount: contractRow.intervalCount,
      anchorDay: contractRow.anchorDay,
      validFrom: contractRow.validFrom,
      validTo: contractRow.validTo,
      autoRenew: Boolean(contractRow.autoRenew),
      graceDays: contractRow.graceDays,
      paymentTermsDays: contractRow.paymentTermsDays,
      taxProfile: (contractRow.taxProfile as TaxProfile) || "non_gst",
      gstRateBps: contractRow.gstRateBps,
      notes: contractRow.notes,
      items,
      createdAt: contractRow.createdAt,
      updatedAt: contractRow.updatedAt,
    });
  }

  async create(contract: Contract): Promise<void> {
    await this.db.insert(contracts).values({
      id: contract.id,
      clientId: contract.clientId,
      code: contract.code,
      title: contract.title,
      status: contract.status,
      amountMinor: contract.amountMinor,
      currency: contract.currency,
      billingCycle: contract.billingCycle,
      intervalCount: contract.intervalCount,
      anchorDay: contract.anchorDay,
      validFrom: contract.validFrom,
      validTo: contract.validTo,
      autoRenew: contract.autoRenew,
      graceDays: contract.graceDays,
      paymentTermsDays: contract.paymentTermsDays,
      taxProfile: contract.taxProfile,
      gstRateBps: contract.gstRateBps,
      notes: contract.notes ?? null,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    });

    if (contract.items.length > 0) {
      for (const it of contract.items) {
        await this.db.insert(contractItems).values({
          id: it.id,
          contractId: contract.id,
          description: it.description,
          amountMinor: it.amountMinor,
          quantity: it.quantity,
          createdAt: it.createdAt,
          updatedAt: it.updatedAt,
        });
      }
    }
  }

  async update(contract: Contract): Promise<void> {
    await this.db
      .update(contracts)
      .set({
        title: contract.title,
        status: contract.status,
        amountMinor: contract.amountMinor,
        currency: contract.currency,
        billingCycle: contract.billingCycle,
        intervalCount: contract.intervalCount,
        anchorDay: contract.anchorDay,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        autoRenew: contract.autoRenew,
        graceDays: contract.graceDays,
        paymentTermsDays: contract.paymentTermsDays,
        taxProfile: contract.taxProfile,
        gstRateBps: contract.gstRateBps,
        notes: contract.notes ?? null,
        updatedAt: contract.updatedAt,
      })
      .where(eq(contracts.id, contract.id));
  }

  async findById(id: string): Promise<Contract | null> {
    const cRows = await this.db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!cRows[0]) return null;

    const iRows = await this.db
      .select()
      .from(contractItems)
      .where(eq(contractItems.contractId, id));

    return this.toDomain(cRows[0], iRows);
  }

  async findByCode(code: string): Promise<Contract | null> {
    const cRows = await this.db.select().from(contracts).where(eq(contracts.code, code)).limit(1);
    if (!cRows[0]) return null;

    const iRows = await this.db
      .select()
      .from(contractItems)
      .where(eq(contractItems.contractId, cRows[0].id));

    return this.toDomain(cRows[0], iRows);
  }

  async list(query?: ListContractsQuery): Promise<{ items: Contract[]; total: number }> {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    const conditions = [];
    if (query?.clientId) {
      conditions.push(eq(contracts.clientId, query.clientId));
    }
    if (query?.status) {
      conditions.push(eq(contracts.status, query.status as any));
    }
    if (query?.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim()}%`;
      conditions.push(or(like(contracts.title, pattern), like(contracts.code, pattern)));
    }

    let q = this.db.select().from(contracts);
    if (conditions.length === 1) {
      q = q.where(conditions[0]!) as any;
    } else if (conditions.length > 1) {
      q = q.where(or(...conditions)) as any;
    }

    const cRows = await q.orderBy(desc(contracts.createdAt)).limit(limit).offset(offset);

    const countRes = await this.db.select({ val: count() }).from(contracts);
    const total = countRes[0]?.val ?? cRows.length;

    // Load items for each contract
    const items: Contract[] = [];
    for (const c of cRows) {
      const iRows = await this.db
        .select()
        .from(contractItems)
        .where(eq(contractItems.contractId, c.id));
      items.push(this.toDomain(c, iRows));
    }

    return { items, total };
  }
}
