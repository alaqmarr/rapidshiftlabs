import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export interface ContractItemProps {
  id: string;
  contractId: string;
  description: string;
  amountMinor: number;
  quantity: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateContractItemParams {
  contractId?: string;
  description: string;
  amountMinor: number;
  quantity?: number;
}

export class ContractItem {
  private props: ContractItemProps;

  constructor(props: ContractItemProps) {
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainRuleError("contract_item_desc_required", "Item description is required");
    }
    if (props.amountMinor < 0) {
      throw new DomainRuleError("contract_item_amount_negative", "Item amount cannot be negative");
    }
    this.props = { ...props };
  }

  static create(params: CreateContractItemParams, contractId: string): ContractItem {
    const now = Date.now();
    return new ContractItem({
      id: newId(ID_PREFIX.contractItem),
      contractId,
      description: params.description.trim(),
      amountMinor: params.amountMinor,
      quantity: params.quantity ?? 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get contractId(): string {
    return this.props.contractId;
  }
  get description(): string {
    return this.props.description;
  }
  get amountMinor(): number {
    return this.props.amountMinor;
  }
  get quantity(): number {
    return this.props.quantity;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  toJSON(): ContractItemProps {
    return { ...this.props };
  }
}
