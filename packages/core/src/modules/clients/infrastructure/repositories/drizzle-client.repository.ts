import { eq, like, or, count, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db/connection-factory";
import {
  clients,
  clientContacts,
  projects,
  type ClientRow,
  type ClientContactRow,
  type ProjectRow,
} from "../../../../shared/infrastructure/db/schema/clients";
import { Client, type ClientStatus, type ClientBillingMode } from "../../domain/entities/client.entity";
import { ClientContact } from "../../domain/entities/client-contact.entity";
import { Project, type ProjectStatus } from "../../domain/entities/project.entity";
import type {
  ClientRepository,
  ListClientsQuery,
} from "../../domain/repositories/client-repository.port";

export class DrizzleClientRepository implements ClientRepository {
  private readonly db: LibSQLDatabase<any>;

  constructor(db?: LibSQLDatabase<any>) {
    this.db = db ?? getDb("core");
  }

  private toDomainClient(row: ClientRow): Client {
    return new Client({
      id: row.id,
      name: row.name,
      slug: row.slug,
      gstin: row.gstin,
      pan: row.pan,
      billingMode: (row.billingMode as ClientBillingMode) || "non_gst",
      currency: row.currency || "INR",
      timezone: row.timezone || "Asia/Kolkata",
      status: (row.status as ClientStatus) || "active",
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country || "India",
      notes: row.notes,
      githubRepo: row.githubRepo,
      githubBranch: row.githubBranch || "main",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toDomainContact(row: ClientContactRow): ClientContact {
    return new ClientContact({
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      title: row.title,
      isPrimary: Boolean(row.isPrimary),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toDomainProject(row: ProjectRow): Project {
    return new Project({
      id: row.id,
      clientId: row.clientId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      status: (row.status as ProjectStatus) || "active",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async create(client: Client): Promise<void> {
    await this.db.insert(clients).values({
      id: client.id,
      name: client.name,
      slug: client.slug,
      gstin: client.gstin ?? null,
      pan: client.pan ?? null,
      billingMode: client.billingMode,
      currency: client.currency,
      timezone: client.timezone,
      status: client.status,
      addressLine1: client.addressLine1 ?? null,
      addressLine2: client.addressLine2 ?? null,
      city: client.city ?? null,
      state: client.state ?? null,
      postalCode: client.postalCode ?? null,
      country: client.country,
      notes: client.notes ?? null,
      githubRepo: client.githubRepo ?? null,
      githubBranch: client.githubBranch || "main",
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    });
  }

  async update(client: Client): Promise<void> {
    await this.db
      .update(clients)
      .set({
        name: client.name,
        slug: client.slug,
        gstin: client.gstin ?? null,
        pan: client.pan ?? null,
        billingMode: client.billingMode,
        currency: client.currency,
        timezone: client.timezone,
        status: client.status,
        addressLine1: client.addressLine1 ?? null,
        addressLine2: client.addressLine2 ?? null,
        city: client.city ?? null,
        state: client.state ?? null,
        postalCode: client.postalCode ?? null,
        country: client.country,
        notes: client.notes ?? null,
        githubRepo: client.githubRepo ?? null,
        githubBranch: client.githubBranch || "main",
        updatedAt: client.updatedAt,
      })
      .where(eq(clients.id, client.id));
  }

  async findById(id: string): Promise<Client | null> {
    const rows = await this.db.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (!rows[0]) return null;
    return this.toDomainClient(rows[0]);
  }

  async findBySlug(slug: string): Promise<Client | null> {
    const rows = await this.db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
    if (!rows[0]) return null;
    return this.toDomainClient(rows[0]);
  }

  async list(query?: ListClientsQuery): Promise<{ items: Client[]; total: number }> {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    let baseQuery = this.db.select().from(clients);

    const conditions = [];
    if (query?.status) {
      conditions.push(eq(clients.status, query.status as any));
    }
    if (query?.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim()}%`;
      conditions.push(or(like(clients.name, pattern), like(clients.slug, pattern)));
    }

    let finalQuery = baseQuery;
    if (conditions.length === 1) {
      finalQuery = baseQuery.where(conditions[0]!) as any;
    } else if (conditions.length > 1) {
      finalQuery = baseQuery.where(or(...conditions)) as any;
    }

    const rows = await finalQuery
      .orderBy(desc(clients.createdAt))
      .limit(limit)
      .offset(offset);

    const countRes = await this.db.select({ val: count() }).from(clients);
    const total = countRes[0]?.val ?? rows.length;

    return {
      items: rows.map((r) => this.toDomainClient(r)),
      total,
    };
  }

  async addContact(contact: ClientContact): Promise<void> {
    await this.db.insert(clientContacts).values({
      id: contact.id,
      clientId: contact.clientId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone ?? null,
      title: contact.title ?? null,
      isPrimary: contact.isPrimary,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    });
  }

  async findContactsByClient(clientId: string): Promise<ClientContact[]> {
    const rows = await this.db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId))
      .orderBy(desc(clientContacts.createdAt));
    return rows.map((r) => this.toDomainContact(r));
  }

  async deleteContact(id: string): Promise<void> {
    await this.db.delete(clientContacts).where(eq(clientContacts.id, id));
  }

  async addProject(project: Project): Promise<void> {
    await this.db.insert(projects).values({
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      slug: project.slug,
      description: project.description ?? null,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  async findProjectsByClient(clientId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(desc(projects.createdAt));
    return rows.map((r) => this.toDomainProject(r));
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id));
  }
}
