import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { getRequestActor } from "@/lib/auth-actor";
import { calculateContractTenure } from "@/lib/contract-tenure";

export const dynamic = "force-dynamic";

export interface CommandPaletteEntityItem {
  id: string;
  category: "client" | "contract" | "invoice" | "process" | "domain" | "ticket" | "release";
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "emerald" | "amber" | "rose" | "blue" | "zinc";
  href: string;
  keywords: string;
}

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const container = getContainer();
    const isAdmin = actor.kind === "admin";
    const items: CommandPaletteEntityItem[] = [];

    if (isAdmin) {
      const sysActor = SYSTEM_ACTOR("smart-command-palette");
      const [clientsRes, contractsRes, invoicesRes, processesList, domainsList, ticketsRes] =
        await Promise.all([
          container.clientDirectoryRepo.list({ limit: 50 }).catch(() => ({ items: [], total: 0 })),
          container.contractRepo.list({ limit: 50 }).catch(() => ({ items: [], total: 0 })),
          container.billingRepo.listInvoices({ limit: 40 }).catch(() => ({ items: [], total: 0 })),
          container.pm2ProcessRepo.listAll().catch(() => []),
          container.monitoredDomainRepo.listAll?.() ?? [],
          container.supportModule.listTicketsUseCase
            .execute({ limit: 30 }, sysActor)
            .catch(() => ({ items: [], total: 0 })),
        ]);

      const clientMap = new Map<string, string>();
      for (const c of clientsRes.items as any[]) {
        clientMap.set(c.id, c.name);
        items.push({
          id: `client_${c.id}`,
          category: "client",
          title: c.name,
          subtitle: `${c.billingEmail || c.slug || c.id} • ${c.currency || "INR"}`,
          badge: (c.status || "active").toUpperCase(),
          badgeTone: c.status === "active" ? "emerald" : "amber",
          href: `/admin/clients/${c.id}`,
          keywords: `${c.name} ${c.slug || ""} ${c.billingEmail || ""} ${c.gstin || ""} client tenant`,
        });
      }

      for (const ct of contractsRes.items as any[]) {
        const tenure = calculateContractTenure({
          billingCycle: ct.billingCycle,
          intervalCount: ct.intervalCount,
          anchorDay: ct.anchorDay,
          validFrom: ct.validFrom,
          validTo: ct.validTo,
          amountMinor: ct.amountMinor,
          status: ct.status,
        });
        const cName = clientMap.get(ct.clientId) || ct.clientId;
        items.push({
          id: `contract_${ct.id}`,
          category: "contract",
          title: `${ct.code || ct.id.slice(0, 8)} — ${cName}`,
          subtitle: `${tenure.tenureLabel} (${tenure.dateRangeLabel})`,
          badge: tenure.isOneTime ? "ONE-TIME" : tenure.cycleLabel.toUpperCase(),
          badgeTone: tenure.isExpiringSoon ? "amber" : tenure.isExpired ? "rose" : "blue",
          href: `/admin/clients/${ct.clientId}`,
          keywords: `${ct.code || ""} ${cName} ${tenure.tenureLabel} contract tenure`,
        });
      }

      for (const inv of invoicesRes.items as any[]) {
        const cName = clientMap.get(inv.clientId) || inv.clientId;
        items.push({
          id: `invoice_${inv.id}`,
          category: "invoice",
          title: `Invoice ${inv.invoiceNumber}`,
          subtitle: `${cName} • ${inv.currency || "INR"} ${(Number(inv.totalMinor || 0) / 100).toLocaleString("en-IN")}`,
          badge: (inv.status || "issued").toUpperCase(),
          badgeTone:
            inv.status === "paid"
              ? "emerald"
              : inv.status === "overdue"
                ? "rose"
                : "amber",
          href: "/admin/invoices",
          keywords: `${inv.invoiceNumber} ${cName} ${inv.status} invoice billing`,
        });
      }

      for (const p of processesList as any[]) {
        const cName = p.clientId ? clientMap.get(p.clientId) || p.clientId : "Unassigned";
        items.push({
          id: `proc_${p.id}`,
          category: "process",
          title: `PM2: ${p.name} (#${p.pm2Id})`,
          subtitle: `${cName} • ${p.restarts || 0} deploys/restarts`,
          badge: (p.status || "online").toUpperCase(),
          badgeTone: p.status === "online" ? "emerald" : "rose",
          href: "/admin/servers",
          keywords: `${p.name} ${cName} pm2 process server fleet`,
        });
      }

      for (const d of domainsList as any[]) {
        const cName = d.clientId ? clientMap.get(d.clientId) || d.clientId : "System";
        items.push({
          id: `dom_${d.id}`,
          category: "domain",
          title: d.hostname,
          subtitle: `${cName} • SSL: ${d.sslExpiryDays ?? "—"}d remaining`,
          badge: (d.status || "up").toUpperCase(),
          badgeTone: d.status === "up" ? "emerald" : "rose",
          href: "/admin/domains",
          keywords: `${d.hostname} ${cName} domain ssl monitoring`,
        });
      }

      const ticketList = (ticketsRes as any).tickets || (ticketsRes as any).items || [];
      for (const t of ticketList as any[]) {
        const st = typeof t.toState === "function" ? t.toState() : t;
        const cName = clientMap.get(st.clientId) || st.clientId;
        items.push({
          id: `tkt_${st.id}`,
          category: "ticket",
          title: `#${st.number || st.ticketNumber || st.id.slice(0, 8)}: ${st.subject}`,
          subtitle: `${cName} • Priority: ${(st.priority || "normal").toUpperCase()}`,
          badge: (st.status || "open").toUpperCase(),
          badgeTone: st.priority === "urgent" || st.priority === "high" ? "rose" : "blue",
          href: "/admin/support",
          keywords: `${st.number || ""} ${st.subject} ${cName} support ticket`,
        });
      }
    } else if ((actor.kind === "client_user" || actor.kind === "api_key") && actor.clientId) {
      const clientId = actor.clientId;
      const [contractsRes, invoicesRes, processesList, domainsList, ticketsRes] = await Promise.all([
        container.contractRepo.list({ clientId, limit: 20 }).catch(() => ({ items: [], total: 0 })),
        container.billingRepo.listInvoices({ clientId, limit: 25 }).catch(() => ({ items: [], total: 0 })),
        container.pm2ProcessRepo.listByClientId(clientId).catch(() => []),
        container.monitoredDomainRepo.findByClientId(clientId).catch(() => []),
        container.supportModule.listTicketsUseCase
          .execute({ clientId, limit: 20 }, actor)
          .catch(() => ({ items: [], total: 0 })),
      ]);

      for (const ct of contractsRes.items as any[]) {
        const tenure = calculateContractTenure({
          billingCycle: ct.billingCycle,
          intervalCount: ct.intervalCount,
          anchorDay: ct.anchorDay,
          validFrom: ct.validFrom,
          validTo: ct.validTo,
          amountMinor: ct.amountMinor,
          status: ct.status,
        });
        items.push({
          id: `contract_${ct.id}`,
          category: "contract",
          title: `Contract ${ct.code || ct.id.slice(0, 8)}`,
          subtitle: `${tenure.tenureLabel} (${tenure.dateRangeLabel})`,
          badge: tenure.isOneTime ? "ONE-TIME" : tenure.cycleLabel.toUpperCase(),
          badgeTone: "blue",
          href: "/portal/contracts",
          keywords: `${ct.code || ""} ${tenure.tenureLabel} contract sla`,
        });
      }

      for (const inv of invoicesRes.items as any[]) {
        items.push({
          id: `invoice_${inv.id}`,
          category: "invoice",
          title: `Invoice ${inv.invoiceNumber}`,
          subtitle: `Due: ${new Date(inv.dueDate).toLocaleDateString()} • ${(Number(inv.totalMinor || 0) / 100).toLocaleString("en-IN")}`,
          badge: (inv.status || "issued").toUpperCase(),
          badgeTone: inv.status === "paid" ? "emerald" : inv.status === "overdue" ? "rose" : "amber",
          href: "/portal/billing",
          keywords: `${inv.invoiceNumber} ${inv.status} invoice billing payment`,
        });
      }

      for (const p of processesList as any[]) {
        items.push({
          id: `proc_${p.id}`,
          category: "process",
          title: `Process: ${p.name} (#${p.pm2Id})`,
          subtitle: `${p.restarts || 0} deploys/restarts`,
          badge: (p.status || "online").toUpperCase(),
          badgeTone: p.status === "online" ? "emerald" : "rose",
          href: "/portal/infrastructure",
          keywords: `${p.name} pm2 process server`,
        });
      }

      for (const d of domainsList as any[]) {
        items.push({
          id: `dom_${d.id}`,
          category: "domain",
          title: d.hostname,
          subtitle: `SSL: ${d.sslExpiryDays ?? "—"}d remaining`,
          badge: (d.status || "up").toUpperCase(),
          badgeTone: d.status === "up" ? "emerald" : "rose",
          href: "/portal/domains",
          keywords: `${d.hostname} domain ssl status`,
        });
      }

      const ticketList = (ticketsRes as any).tickets || (ticketsRes as any).items || [];
      for (const t of ticketList as any[]) {
        const st = typeof t.toState === "function" ? t.toState() : t;
        items.push({
          id: `tkt_${st.id}`,
          category: "ticket",
          title: `#${st.number || st.ticketNumber || st.id.slice(0, 8)}: ${st.subject}`,
          subtitle: `Priority: ${(st.priority || "normal").toUpperCase()}`,
          badge: (st.status || "open").toUpperCase(),
          badgeTone: "blue",
          href: "/portal/support",
          keywords: `${st.number || ""} ${st.subject} support ticket`,
        });
      }
    }

    return NextResponse.json({
      realm: isAdmin ? "admin" : "client",
      items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load command palette index" },
      { status: 500 },
    );
  }
}
