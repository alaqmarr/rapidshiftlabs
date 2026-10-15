import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface ContractActivatedPayload {
  contractId: string;
  clientId: string;
  code: string;
  amountMinor: number;
  currency: string;
  billingCycle: string;
  intervalCount: number;
  anchorDay: number;
  validFrom: number;
  validTo: number;
  taxProfile: string;
  gstRateBps: number;
  paymentTermsDays: number;
  graceDays: number;
}

export function createContractActivatedEvent(payload: ContractActivatedPayload): DomainEvent<"contract.activated", ContractActivatedPayload> {
  return createEvent("contract.activated", {
    aggregateType: "contract",
    aggregateId: payload.contractId,
    clientId: payload.clientId,
    payload,
  });
}

export interface ContractTerminatedPayload {
  contractId: string;
  clientId: string;
  reason?: string;
  terminatedAt: number;
}

export function createContractTerminatedEvent(payload: ContractTerminatedPayload): DomainEvent<"contract.terminated", ContractTerminatedPayload> {
  return createEvent("contract.terminated", {
    aggregateType: "contract",
    aggregateId: payload.contractId,
    clientId: payload.clientId,
    payload,
  });
}
