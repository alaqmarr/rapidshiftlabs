import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";
import { ContractItem, type ContractItemProps } from "./contract-item.entity";
import {
  createContractActivatedEvent,
  createContractTerminatedEvent,
} from "../events/contract-events";

export type ContractStatus = "draft" | "active" | "renewed" | "expired" | "terminated";
export type BillingCycle =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "every_n_days"
  | "one_time"
  | "milestone";
export type TaxProfile = "gst" | "non_gst";

export interface ContractProps {
  id: string;
  clientId: string;
  code: string;
  title: string;
  status: ContractStatus;
  amountMinor: number;
  currency: string;
  billingCycle: BillingCycle;
  intervalCount: number;
  anchorDay: number;
  validFrom: number;
  validTo: number;
  autoRenew: boolean;
  graceDays: number;
  paymentTermsDays: number;
  taxProfile: TaxProfile;
  gstRateBps: number;
  notes?: string | null;
  items: ContractItem[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateContractParams {
  clientId: string;
  code?: string;
  title: string;
  amountMinor?: number;
  currency?: string;
  billingCycle?: BillingCycle;
  intervalCount?: number;
  anchorDay?: number;
  validFrom: number;
  validTo: number;
  autoRenew?: boolean;
  graceDays?: number;
  paymentTermsDays?: number;
  taxProfile?: TaxProfile;
  gstRateBps?: number;
  notes?: string;
  items?: Array<{ description: string; amountMinor: number; quantity?: number }>;
}

export class Contract extends AggregateRoot<ContractProps> {
  constructor(props: ContractProps) {
    if (!props.clientId) {
      throw new DomainRuleError("contract_client_required", "Client ID is required");
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new DomainRuleError("contract_title_required", "Contract title is required");
    }
    const isSinglePointCycle =
      props.billingCycle === "one_time" || props.billingCycle === "milestone";
    if (isSinglePointCycle) {
      if (props.validTo < props.validFrom) {
        throw new DomainRuleError(
          "contract_tenure_invalid",
          "validTo cannot be before validFrom",
        );
      }
    } else if (props.validTo <= props.validFrom) {
      throw new DomainRuleError("contract_tenure_invalid", "validTo must be strictly after validFrom");
    }
    if (props.anchorDay < 1 || props.anchorDay > 31) {
      throw new DomainRuleError("contract_anchor_invalid", "anchorDay must be between 1 and 31");
    }
    super(props);
  }

  static create(params: CreateContractParams): Contract {
    const now = Date.now();
    const contractId = newId(ID_PREFIX.contract);
    const code = params.code || `CTR-${new Date(params.validFrom).getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const items: ContractItem[] = (params.items || []).map((it) =>
      ContractItem.create(it, contractId),
    );

    let amountMinor = params.amountMinor ?? 0;
    if (amountMinor === 0 && items.length > 0) {
      amountMinor = items.reduce((sum, it) => sum + it.amountMinor * it.quantity, 0);
    }

    const billingCycle = params.billingCycle || "monthly";
    const isSinglePointCycle = billingCycle === "one_time" || billingCycle === "milestone";
    const validTo =
      isSinglePointCycle && (!params.validTo || params.validTo <= params.validFrom)
        ? params.validFrom + 86_400_000
        : params.validTo;

    return new Contract({
      id: contractId,
      clientId: params.clientId,
      code,
      title: params.title.trim(),
      status: "draft",
      amountMinor,
      currency: params.currency || "INR",
      billingCycle,
      intervalCount: params.intervalCount ?? 1,
      anchorDay: params.anchorDay ?? 1,
      validFrom: params.validFrom,
      validTo,
      autoRenew: isSinglePointCycle ? false : (params.autoRenew ?? false),
      graceDays: params.graceDays ?? 7,
      paymentTermsDays: params.paymentTermsDays ?? 15,
      taxProfile: params.taxProfile || "non_gst",
      gstRateBps: params.gstRateBps ?? 1800,
      notes: params.notes?.trim() || null,
      items,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get code(): string {
    return this.props.code;
  }
  get title(): string {
    return this.props.title;
  }
  get status(): ContractStatus {
    return this.props.status;
  }
  get amountMinor(): number {
    return this.props.amountMinor;
  }
  get currency(): string {
    return this.props.currency;
  }
  get billingCycle(): BillingCycle {
    return this.props.billingCycle;
  }
  get intervalCount(): number {
    return this.props.intervalCount;
  }
  get anchorDay(): number {
    return this.props.anchorDay;
  }
  get validFrom(): number {
    return this.props.validFrom;
  }
  get validTo(): number {
    return this.props.validTo;
  }
  get autoRenew(): boolean {
    return this.props.autoRenew;
  }
  get graceDays(): number {
    return this.props.graceDays;
  }
  get paymentTermsDays(): number {
    return this.props.paymentTermsDays;
  }
  get taxProfile(): TaxProfile {
    return this.props.taxProfile;
  }
  get gstRateBps(): number {
    return this.props.gstRateBps;
  }
  get notes(): string | null | undefined {
    return this.props.notes;
  }
  get items(): ContractItem[] {
    return this.props.items;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  activate(): void {
    if (this.props.status !== "draft") {
      throw new DomainRuleError(
        "contract_activation_invalid",
        `Cannot activate contract in status '${this.props.status}'`,
      );
    }
    this.props.status = "active";
    this.props.updatedAt = Date.now();

    this.raise(
      createContractActivatedEvent({
        contractId: this.id,
        clientId: this.clientId,
        code: this.code,
        amountMinor: this.amountMinor,
        currency: this.currency,
        billingCycle: this.billingCycle,
        intervalCount: this.intervalCount,
        anchorDay: this.anchorDay,
        validFrom: this.validFrom,
        validTo: this.validTo,
        taxProfile: this.taxProfile,
        gstRateBps: this.gstRateBps,
        paymentTermsDays: this.paymentTermsDays,
        graceDays: this.graceDays,
      }),
    );
  }

  terminate(reason?: string): void {
    if (this.props.status !== "active") {
      throw new DomainRuleError(
        "contract_termination_invalid",
        `Cannot terminate contract in status '${this.props.status}'`,
      );
    }
    this.props.status = "terminated";
    this.props.updatedAt = Date.now();

    this.raise(
      createContractTerminatedEvent({
        contractId: this.id,
        clientId: this.clientId,
        reason,
        terminatedAt: this.props.updatedAt,
      }),
    );
  }

  renew(newValidTo: number): void {
    if (newValidTo <= this.props.validTo) {
      throw new DomainRuleError("contract_renew_invalid", "newValidTo must extend beyond current validTo");
    }
    this.props.validTo = newValidTo;
    this.props.status = "active";
    this.props.updatedAt = Date.now();
  }

  updateDetails(params: {
    title?: string;
    amountMinor?: number;
    currency?: string;
    billingCycle?: BillingCycle;
    intervalCount?: number;
    anchorDay?: number;
    validFrom?: number;
    validTo?: number;
    autoRenew?: boolean;
    taxProfile?: TaxProfile;
    status?: ContractStatus;
    notes?: string | null;
  }): void {
    if (params.title !== undefined && params.title.trim().length > 0) {
      this.props.title = params.title.trim();
    }
    if (params.amountMinor !== undefined && params.amountMinor >= 0) {
      this.props.amountMinor = params.amountMinor;
    }
    if (params.currency !== undefined) {
      this.props.currency = params.currency;
    }
    if (params.billingCycle !== undefined) {
      this.props.billingCycle = params.billingCycle;
    }
    if (params.intervalCount !== undefined && params.intervalCount >= 1) {
      this.props.intervalCount = params.intervalCount;
    }
    if (params.anchorDay !== undefined && params.anchorDay >= 1 && params.anchorDay <= 31) {
      this.props.anchorDay = params.anchorDay;
    }
    const nextValidFrom = params.validFrom ?? this.props.validFrom;
    const isSinglePoint =
      this.props.billingCycle === "one_time" || this.props.billingCycle === "milestone";
    let nextValidTo = params.validTo ?? this.props.validTo;
    if (isSinglePoint && nextValidTo <= nextValidFrom) {
      nextValidTo = nextValidFrom + 86_400_000;
    }
    if (!isSinglePoint && nextValidTo <= nextValidFrom) {
      throw new DomainRuleError("contract_tenure_invalid", "validTo must be strictly after validFrom");
    }
    this.props.validFrom = nextValidFrom;
    this.props.validTo = nextValidTo;
    if (params.autoRenew !== undefined) {
      this.props.autoRenew = isSinglePoint ? false : params.autoRenew;
    }
    if (params.taxProfile !== undefined) {
      this.props.taxProfile = params.taxProfile;
    }
    if (params.status !== undefined) {
      this.props.status = params.status;
    }
    if (params.notes !== undefined) {
      this.props.notes = params.notes ? params.notes.trim() : null;
    }
    this.props.updatedAt = Date.now();
  }

  addItem(item: ContractItem): void {
    this.props.items.push(item);
    this.recalculateTotal();
  }

  removeItem(itemId: string): void {
    this.props.items = this.props.items.filter((it) => it.id !== itemId);
    this.recalculateTotal();
  }

  private recalculateTotal(): void {
    if (this.props.items.length > 0) {
      this.props.amountMinor = this.props.items.reduce(
        (sum, it) => sum + it.amountMinor * it.quantity,
        0,
      );
    }
    this.props.updatedAt = Date.now();
  }

  toJSON(): Omit<ContractProps, "items"> & { items: ContractItemProps[] } {
    return {
      ...this.props,
      items: this.props.items.map((it) => it.toJSON()),
    };
  }
}
