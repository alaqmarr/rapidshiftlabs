import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export interface ClientContactProps {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  isPrimary: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateClientContactParams {
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
}

export class ClientContact {
  private props: ClientContactProps;

  constructor(props: ClientContactProps) {
    if (!props.name || props.name.trim().length === 0) {
      throw new DomainRuleError("contact_name_required", "Contact name is required");
    }
    if (!props.email || !props.email.includes("@")) {
      throw new DomainRuleError("contact_email_invalid", "Valid contact email is required");
    }
    this.props = { ...props };
  }

  static create(params: CreateClientContactParams): ClientContact {
    const now = Date.now();
    return new ClientContact({
      id: newId(ID_PREFIX.contact),
      clientId: params.clientId,
      name: params.name.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone?.trim() || null,
      title: params.title?.trim() || null,
      isPrimary: params.isPrimary ?? false,
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
  get name(): string {
    return this.props.name;
  }
  get email(): string {
    return this.props.email;
  }
  get phone(): string | null | undefined {
    return this.props.phone;
  }
  get title(): string | null | undefined {
    return this.props.title;
  }
  get isPrimary(): boolean {
    return this.props.isPrimary;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  toJSON(): ClientContactProps {
    return { ...this.props };
  }
}
