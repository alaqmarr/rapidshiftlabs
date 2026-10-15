import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";
import {
  validatePincode,
  validateGstin,
  validatePan,
  validateAddress,
} from "../../../../shared/kernel/validation";

export type ClientBillingMode = "gst" | "non_gst";
export type ClientStatus = "active" | "inactive" | "suspended";

export interface ClientProps {
  id: string;
  name: string;
  slug: string;
  gstin?: string | null;
  pan?: string | null;
  billingMode: ClientBillingMode;
  currency: string;
  timezone: string;
  status: ClientStatus;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  notes?: string | null;
  githubRepo?: string | null;
  githubBranch?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateClientParams {
  name: string;
  slug?: string;
  gstin?: string;
  pan?: string;
  billingMode?: ClientBillingMode;
  currency?: string;
  timezone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  githubRepo?: string;
  githubBranch?: string;
}

export class Client {
  private props: ClientProps;

  constructor(props: ClientProps) {
    if (!props.name || props.name.trim().length === 0) {
      throw new DomainRuleError("client_name_required", "Client legal name is required");
    }
    if (!props.slug || props.slug.trim().length === 0) {
      throw new DomainRuleError("client_slug_required", "Client slug is required");
    }

    const country = props.country?.trim() || "India";
    if (props.postalCode) {
      const pinResult = validatePincode(props.postalCode, country);
      if (!pinResult.isValid) {
        throw new DomainRuleError("client_postal_code_invalid", pinResult.error || "Invalid postal code");
      }
    }

    if (props.gstin) {
      const gstinResult = validateGstin(props.gstin, props.state || undefined);
      if (!gstinResult.isValid) {
        throw new DomainRuleError("client_gstin_invalid", gstinResult.error || "Invalid GSTIN");
      }
    }

    if (props.pan) {
      const panResult = validatePan(props.pan, props.gstin || undefined);
      if (!panResult.isValid) {
        throw new DomainRuleError("client_pan_invalid", panResult.error || "Invalid PAN");
      }
    }

    this.props = { ...props };
  }

  static create(params: CreateClientParams): Client {
    const now = Date.now();
    const slug =
      params.slug && params.slug.trim().length > 0
        ? params.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-")
        : params.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    const country = params.country?.trim() || "India";
    const postalCode = params.postalCode?.trim() || null;
    const gstin = params.gstin?.trim()?.toUpperCase() || null;
    const pan = params.pan?.trim()?.toUpperCase() || null;
    const currency = params.currency?.trim()?.toUpperCase() || "INR";

    return new Client({
      id: newId(ID_PREFIX.client),
      name: params.name.trim(),
      slug,
      gstin,
      pan,
      billingMode: params.billingMode || "non_gst",
      currency,
      timezone: params.timezone || "Asia/Kolkata",
      status: "active",
      addressLine1: params.addressLine1?.trim() || null,
      addressLine2: params.addressLine2?.trim() || null,
      city: params.city?.trim() || null,
      state: params.state?.trim() || null,
      postalCode,
      country,
      notes: params.notes?.trim() || null,
      githubRepo: params.githubRepo?.trim() || null,
      githubBranch: params.githubBranch?.trim() || "main",
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get slug(): string {
    return this.props.slug;
  }
  get gstin(): string | null | undefined {
    return this.props.gstin;
  }
  get pan(): string | null | undefined {
    return this.props.pan;
  }
  get billingMode(): ClientBillingMode {
    return this.props.billingMode;
  }
  get currency(): string {
    return this.props.currency;
  }
  get timezone(): string {
    return this.props.timezone;
  }
  get status(): ClientStatus {
    return this.props.status;
  }
  get addressLine1(): string | null | undefined {
    return this.props.addressLine1;
  }
  get addressLine2(): string | null | undefined {
    return this.props.addressLine2;
  }
  get city(): string | null | undefined {
    return this.props.city;
  }
  get state(): string | null | undefined {
    return this.props.state;
  }
  get postalCode(): string | null | undefined {
    return this.props.postalCode;
  }
  get country(): string {
    return this.props.country;
  }
  get notes(): string | null | undefined {
    return this.props.notes;
  }
  get githubRepo(): string | null | undefined {
    return this.props.githubRepo;
  }
  get githubBranch(): string | null | undefined {
    return this.props.githubBranch;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  update(params: Partial<Omit<ClientProps, "id" | "createdAt" | "updatedAt">>): void {
    if (params.name !== undefined && params.name.trim().length === 0) {
      throw new DomainRuleError("client_name_required", "Client name cannot be empty");
    }

    const country = params.country !== undefined ? params.country.trim() : this.props.country;
    const state = params.state !== undefined ? params.state?.trim() || null : this.props.state;

    if (params.postalCode !== undefined && params.postalCode) {
      const pinResult = validatePincode(params.postalCode, country || "India");
      if (!pinResult.isValid) {
        throw new DomainRuleError("client_postal_code_invalid", pinResult.error || "Invalid postal code");
      }
    }

    const gstin = params.gstin !== undefined ? params.gstin?.trim()?.toUpperCase() || null : this.props.gstin;
    if (params.gstin !== undefined && gstin) {
      const gstinResult = validateGstin(gstin, state || undefined);
      if (!gstinResult.isValid) {
        throw new DomainRuleError("client_gstin_invalid", gstinResult.error || "Invalid GSTIN");
      }
    }

    if (params.pan !== undefined && params.pan) {
      const pan = params.pan.trim().toUpperCase();
      const panResult = validatePan(pan, gstin || undefined);
      if (!panResult.isValid) {
        throw new DomainRuleError("client_pan_invalid", panResult.error || "Invalid PAN");
      }
    }

    this.props = {
      ...this.props,
      ...params,
      gstin: params.gstin !== undefined ? (params.gstin?.trim()?.toUpperCase() || null) : this.props.gstin,
      pan: params.pan !== undefined ? (params.pan?.trim()?.toUpperCase() || null) : this.props.pan,
      currency: params.currency !== undefined ? (params.currency.trim().toUpperCase() || "INR") : this.props.currency,
      updatedAt: Date.now(),
    };
  }

  activate(): void {
    this.props.status = "active";
    this.props.updatedAt = Date.now();
  }

  suspend(): void {
    this.props.status = "suspended";
    this.props.updatedAt = Date.now();
  }

  deactivate(): void {
    this.props.status = "inactive";
    this.props.updatedAt = Date.now();
  }

  toJSON(): ClientProps {
    return { ...this.props };
  }
}
