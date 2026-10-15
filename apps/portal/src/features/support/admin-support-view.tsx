"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LifeBuoy,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  MessageSquare,
  Lock,
  Search,
  Filter,
  User,
  ExternalLink,
  Flame,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface SerializedTicket {
  id: string;
  number: string;
  clientId: string;
  clientName?: string;
  projectId?: string | null;
  category: string;
  subject: string;
  priority: "P1" | "P2" | "P3" | "P4";
  level: "L1" | "L2" | "L3";
  status: "open" | "in_progress" | "waiting_on_client" | "resolved" | "closed" | "escalated";
  assigneeName?: string | null;
  source: string;
  firstResponseDueAt: number;
  firstRespondedAt?: number | null;
  resolutionDueAt: number;
  resolvedAt?: number | null;
  slaBreached: boolean;
  csatRating?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface CannedReplyOption {
  id: string;
  title: string;
  category: string;
  content: string;
}

interface AdminSupportViewProps {
  initialTickets: SerializedTicket[];
  clients: ClientOption[];
  cannedReplies: CannedReplyOption[];
}

const formatDate = (ms: number | string | undefined) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatTime = (ms: number | string | undefined) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
};

const formatDateTime = (ms: number | string | undefined) => {
  if (!ms) return "—";
  return `${formatDate(ms)} ${formatTime(ms)}`;
};

export interface AdminTicketMessageItem {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorType: "admin" | "client" | "system";
  body: string;
  isInternal: boolean;
  createdAt: number;
}

export function AdminSupportView({
  initialTickets,
  clients,
  cannedReplies,
}: AdminSupportViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [tickets, setTickets] = useState<SerializedTicket[]>(initialTickets);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const [selectedTicket, setSelectedTicket] = useState<SerializedTicket | null>(null);
  const [messages, setMessages] = useState<AdminTicketMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [newTicket, setNewTicket] = useState({
    clientId: clients[0]?.id || "",
    category: "bug",
    subject: "",
    priority: "P2" as "P1" | "P2" | "P3" | "P4",
    initialMessage: "",
  });

  // Reply states
  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const selectedTicketRef = useRef<SerializedTicket | null>(selectedTicket);
  useEffect(() => {
    selectedTicketRef.current = selectedTicket;
  }, [selectedTicket]);

  // Realtime SSE Listener for tickets and messages (stable connection)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/stream?topics=tickets");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "ticket.updated") {
            const updated = data.payload || data.data;
            if (updated) {
              setTickets((prev) =>
                prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
              );
              if (selectedTicketRef.current && selectedTicketRef.current.id === updated.id) {
                setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : null));
              }
            }
          } else if (data && data.type === "ticket.created") {
            const created = data.payload || data.data;
            if (created) {
              setTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
            }
          } else if (data && data.type === "ticket.message_added") {
            const payload = data.payload || data.data;
            if (payload && selectedTicketRef.current && payload.ticketId === selectedTicketRef.current.id) {
              const newMsg: AdminTicketMessageItem = {
                id: payload.id,
                ticketId: payload.ticketId,
                authorId: payload.authorId || payload.senderId || "",
                authorName: payload.authorName || payload.senderName || "User",
                authorType: payload.authorType || (payload.senderType === "staff" ? "admin" : "client"),
                body: payload.body,
                isInternal: Boolean(payload.isInternal),
                createdAt: payload.createdAt || Date.now(),
              };
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
          }
        } catch (parseErr) {
          console.warn("[AdminSupportView] SSE Parse error:", parseErr);
        }
      };
      es.onerror = (err) => {
        console.warn("[AdminSupportView] SSE Connection warning:", err);
      };
    } catch (sseErr) {
      console.warn("[AdminSupportView] SSE Connection init error:", sseErr);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Fetch messages whenever selectedTicket changes
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setLoadingMessages(true);

    fetch(`/api/v1/tickets/${selectedTicket.id}/messages`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data)
          ? data
          : data.data || data.items || data.messages || [];
        const mapped: AdminTicketMessageItem[] = list.map((m: any) => ({
          id: m.id,
          ticketId: m.ticketId,
          authorId: m.authorId || m.senderId || "",
          authorName:
            m.authorName ||
            m.senderName ||
            (m.authorType === "admin" ? "Staff Operations" : "Client"),
          authorType:
            m.authorType ||
            (m.senderType === "staff" || m.senderType === "system" ? "admin" : "client"),
          body: m.body,
          isInternal: Boolean(m.isInternal),
          createdAt: m.createdAt || Date.now(),
        }));
        setMessages(mapped);
      })
      .catch(() => {
        if (isMounted) setMessages([]);
      })
      .finally(() => {
        if (isMounted) setLoadingMessages(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTicket?.id]);

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.clientName && t.clientName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const totalCount = tickets.length;
  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const escalatedCount = tickets.filter((t) => t.status === "escalated" || t.level === "L3").length;
  const breachedCount = tickets.filter((t) => t.slaBreached).length;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.subject.trim() || !newTicket.clientId) {
      showError("Validation Error", "Please provide a client and subject for the ticket.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTicket),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create ticket");
      }

      const clientObj = clients.find((c) => c.id === newTicket.clientId);
      const ticketObj = data.ticket || data.data?.ticket || data;
      const created: SerializedTicket = {
        id: ticketObj.id || data.id,
        number: ticketObj.number || data.number || `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: ticketObj.clientId || newTicket.clientId,
        clientName: clientObj?.name || newTicket.clientId,
        category: ticketObj.category || newTicket.category,
        subject: ticketObj.subject || newTicket.subject,
        priority: ticketObj.priority || newTicket.priority,
        level: ticketObj.level || "L1",
        status: ticketObj.status || "open",
        source: ticketObj.source || "admin",
        firstResponseDueAt: ticketObj.firstResponseDueAt || Date.now() + 60 * 60 * 1000,
        resolutionDueAt: ticketObj.resolutionDueAt || Date.now() + 8 * 60 * 60 * 1000,
        slaBreached: Boolean(ticketObj.slaBreached),
        createdAt: ticketObj.createdAt || Date.now(),
        updatedAt: ticketObj.updatedAt || Date.now(),
      };

      setTickets((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewTicket({
        clientId: clients[0]?.id || "",
        category: "bug",
        subject: "",
        priority: "P2",
        initialMessage: "",
      });

      showSuccess(
        "Support Ticket Created",
        `Ticket ${created.number} has been logged under ${clientObj?.name || "client account"}. SLA tracking initiated.`,
        [
          { label: "Ticket Number", value: created.number },
          { label: "Priority", value: created.priority },
          { label: "Client ID", value: created.clientId },
        ]
      );
    } catch (err: any) {
      showError("Ticket Creation Failed", err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ticket: SerializedTicket, newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to update ticket status");
      }

      const updated = {
        ...ticket,
        status: newStatus as any,
        updatedAt: Date.now(),
        resolvedAt: newStatus === "resolved" ? Date.now() : ticket.resolvedAt,
      };

      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(updated);
      }

      showSuccess("Ticket Status Updated", `Ticket ${ticket.number} status set to "${newStatus.replace("_", " ")}".`);
    } catch (err: any) {
      showError("Status Update Failed", err.message || "Could not update ticket status.");
    }
  };

  const handleEscalate = (ticket: SerializedTicket) => {
    const nextLevel = ticket.level === "L1" ? "L2" : "L3";
    showAlert({
      type: "warning",
      title: `Escalate Ticket to ${nextLevel}?`,
      description: `Advancing this ticket to ${nextLevel} triggers higher priority notification to Tier ${nextLevel.slice(1)} duty leads and modifies resolution SLA enforcement.`,
      details: [
        { label: "Ticket Number", value: ticket.number },
        { label: "Current Level", value: ticket.level },
        { label: "Next Target Level", value: nextLevel },
        { label: "Client", value: ticket.clientName || ticket.clientId },
      ],
      primaryAction: {
        label: `Confirm Escalation to ${nextLevel}`,
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/tickets/${ticket.id}/escalate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Manual operational escalation by staff" }),
            });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Failed to escalate ticket");
            }
            const updated = {
              ...ticket,
              level: nextLevel as any,
              status: "escalated" as any,
              updatedAt: Date.now(),
            };
            setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
            if (selectedTicket?.id === ticket.id) setSelectedTicket(updated);

            showSuccess(
              `Ticket Escalated to ${nextLevel}`,
              `Ticket ${ticket.number} is now managed under Tier ${nextLevel.slice(1)} emergency SLA procedures.`
            );
          } catch (err: any) {
            showError("Escalation Failed", err.message || "Failed to escalate ticket.");
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyText.trim(),
          isInternal: isInternalNote,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || "Failed to post message");
      }

      const msgData = d.data || d;
      const newMsg: AdminTicketMessageItem = {
        id: msgData.id || `msg_${Date.now().toString(36)}`,
        ticketId: selectedTicket.id,
        authorId: msgData.authorId || "staff",
        authorName: msgData.authorName || "Staff Operations",
        authorType: "admin",
        body: msgData.body || replyText.trim(),
        isInternal: isInternalNote,
        createdAt: msgData.createdAt || Date.now(),
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      if (!isInternalNote && !selectedTicket.firstRespondedAt) {
        const updated = {
          ...selectedTicket,
          firstRespondedAt: Date.now(),
        };
        setSelectedTicket(updated);
        setTickets((prev) => prev.map((t) => (t.id === selectedTicket.id ? updated : t)));
      }

      showSuccess(
        isInternalNote ? "Internal Note Added" : "Response Dispatched",
        isInternalNote
          ? `Your private staff note was recorded on ${selectedTicket.number}.`
          : `Reply sent to client on ${selectedTicket.number}. First response SLA fulfilled.`
      );
      setReplyText("");
    } catch (err: any) {
      showError("Message Failed", err.message || "Could not post message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>24×7 RapidShift SLA Support Engine</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Support Desk &amp; Escalation Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Triage incoming client incident reports, monitor live SLA response timers, enforce 3-tier escalation matrices, and dispatch resolution communications.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">Log Support Ticket</span>
            </button>
          </div>
        </div>

        {/* Telemetry KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <div className="steel-metric-label text-zinc-400">All Tickets</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">{totalCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="steel-metric-label text-blue-600 dark:text-blue-400">Active / Open</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-1 tabular-nums">{openCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <div className="steel-metric-label text-amber-600 dark:text-amber-400">Escalated (Tier 2/3)</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{escalatedCount}</div>
          </div>
          <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
            <div className="steel-metric-label text-rose-600 dark:text-rose-400">SLA Breached</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-rose-600 dark:text-rose-400 mt-1 tabular-nums">{breachedCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by subject, #number, client..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">Status: All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_on_client">Waiting Client</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">Priority: All</option>
            <option value="P1">P1 - Critical (15m SLA)</option>
            <option value="P2">P2 - High (1h SLA)</option>
            <option value="P3">P3 - Medium (4h SLA)</option>
            <option value="P4">P4 - Low (24h SLA)</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        {filteredTickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-zinc-900 dark:text-white">No Tickets Found</div>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              There are no support tickets matching your current search or status filter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredTickets.map((ticket) => {
              const priorityColors = {
                P1: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
                P2: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
                P3: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
                P4: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400",
              };

              const statusColors = {
                open: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
                in_progress: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
                waiting_on_client: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400",
                escalated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
                resolved: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400",
                closed: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-500",
              };

              return (
                <div
                  key={ticket.id}
                  className="p-5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-tech text-xs font-bold text-zinc-500 dark:text-zinc-400">
                        {ticket.number}
                      </span>
                      <span className={`steel-pill px-2 py-0.5 rounded text-[10px] font-bold border ${priorityColors[ticket.priority]}`}>
                        {ticket.priority}
                      </span>
                      <span className="steel-pill px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Tier {ticket.level}
                      </span>
                      <span className={`steel-pill px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusColors[ticket.status]}`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      {ticket.slaBreached && (
                        <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                          <Flame className="w-3 h-3" />
                          SLA Breach
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-bold font-steel text-zinc-900 dark:text-white truncate">
                      {ticket.subject}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-sans">
                      <span>Client: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{ticket.clientName || ticket.clientId}</span></span>
                      <span>&bull;</span>
                      <span>Category: <span className="capitalize">{ticket.category}</span></span>
                      <span>&bull;</span>
                      <span className="font-tech">Created: {formatDate(ticket.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEscalate(ticket);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 transition cursor-pointer font-tech"
                    >
                      Escalate ({ticket.level === "L1" ? "L2" : "L3"})
                    </button>
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition font-tech"
                    >
                      View Thread
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket Detail Drawer/Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-zinc-500">{selectedTicket.number}</span>
                  <span className="text-xs px-2 py-0.5 rounded font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
                    Tier {selectedTicket.level}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">
                    {selectedTicket.status.replace("_", " ")}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{selectedTicket.subject}</h2>
                <div className="text-xs text-zinc-500 mt-1">
                  Client: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{selectedTicket.clientName}</span> &bull; ID: {selectedTicket.clientId}
                </div>
              </div>

              <button
                onClick={() => setSelectedTicket(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-500">Update Status:</span>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => handleStatusChange(selectedTicket, e.target.value)}
                  className="px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_on_client">Waiting Client</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEscalate(selectedTicket)}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
                >
                  Escalate to {selectedTicket.level === "L1" ? "Tier 2" : "Tier 3"}
                </button>
              </div>
            </div>

            {/* SLA Clock Details */}
            <div className="p-6 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-zinc-400">First Response Target</span>
                <div className="font-bold text-zinc-900 dark:text-white mt-0.5">
                  {formatTime(selectedTicket.firstResponseDueAt)}
                </div>
              </div>
              <div>
                <span className="text-zinc-400">Resolution SLA Target</span>
                <div className="font-bold text-zinc-900 dark:text-white mt-0.5">
                  {formatTime(selectedTicket.resolutionDueAt)}
                </div>
              </div>
              <div>
                <span className="text-zinc-400">SLA Status</span>
                <div className="font-bold mt-0.5">
                  {selectedTicket.slaBreached ? (
                    <span className="text-rose-600 font-bold">Breached</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">Compliant &amp; Active</span>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation Thread & Canned Replies */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Initial Ticket Issue Description */}
              <div className="p-4 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 mb-1">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Reported by {selectedTicket.clientName || selectedTicket.clientId}</span>
                  </span>
                  <span className="font-mono text-[11px]">{formatDateTime(selectedTicket.createdAt)}</span>
                </div>
                <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 mt-1 uppercase tracking-wide">
                  {selectedTicket.category} &bull; Priority {selectedTicket.priority} &bull; Via {selectedTicket.source}
                </div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200 mt-2 font-medium">
                  {selectedTicket.subject}
                </p>
              </div>

              {/* Conversation Messages Thread */}
              {loadingMessages ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                  <IosSpinner size="md" className="text-indigo-500" />
                  <span>Loading conversation thread...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  No additional messages posted yet. Use the reply box below to communicate with the client or record an internal staff note.
                </div>
              ) : (
                messages.map((m) => {
                  if (m.isInternal) {
                    return (
                      <div
                        key={m.id}
                        className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-800 dark:text-amber-400 text-[11px] uppercase tracking-wider">
                            <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Internal Staff Note &bull; {m.authorName}
                          </span>
                          <span className="font-mono text-[11px] text-amber-700/70 dark:text-amber-400/70">
                            {formatDateTime(m.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed whitespace-pre-wrap">
                          {m.body}
                        </p>
                      </div>
                    );
                  }

                  const isStaff = m.authorType === "admin" || m.authorType === "system";

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {isStaff
                            ? `Staff: ${m.authorName}`
                            : `${selectedTicket.clientName || "Client"}: ${m.authorName}`}
                        </span>
                        <span>&bull;</span>
                        <span className="font-mono">{formatTime(m.createdAt)}</span>
                      </div>
                      <div
                        className={`p-3.5 rounded-2xl max-w-lg text-xs leading-relaxed ${
                          isStaff
                            ? "bg-indigo-600 text-white rounded-tr-sm"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm border border-zinc-200/60 dark:border-zinc-700/60"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.body}</div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Canned reply shortcuts */}
              {cannedReplies.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Canned Macro Templates</span>
                  <div className="flex flex-wrap gap-2">
                    {cannedReplies.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReplyText(r.content)}
                        className="px-2.5 py-1 rounded-lg text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition"
                      >
                        {r.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Message Reply Form */}
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInternalNote(false)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                      !isInternalNote
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    Public Reply to Client
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternalNote(true)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
                      isInternalNote
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    Internal Staff Note
                  </button>
                </div>
              </div>

              <div className="relative">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    isInternalNote
                      ? "Add an internal staff note (never visible to client)..."
                      : "Type response to client..."
                  }
                  rows={3}
                  className="w-full p-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={submitting || !replyText.trim()}
                  onClick={handleSendReply}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isInternalNote ? "Record Note" : "Send Reply"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-600" />
                Log Support Ticket
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Client Account
                </label>
                <select
                  value={newTicket.clientId}
                  onChange={(e) => setNewTicket({ ...newTicket, clientId: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="bug">Software Bug</option>
                    <option value="outage">Infrastructure Outage</option>
                    <option value="billing">Billing &amp; Payment</option>
                    <option value="access">Access Gate &amp; Entitlement</option>
                    <option value="change-request">Change Request</option>
                    <option value="question">General Query</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Priority / SLA
                  </label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="P1">P1 - Critical (15m SLA)</option>
                    <option value="P2">P2 - High (1h SLA)</option>
                    <option value="P3">P3 - Medium (4h SLA)</option>
                    <option value="P4">P4 - Low (24h SLA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Subject / Summary
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., PostgreSQL connection timeout on staging VM"
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Initial Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide incident context, logs, or error traces..."
                  value={newTicket.initialMessage}
                  onChange={(e) => setNewTicket({ ...newTicket, initialMessage: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition"
                >
                  {submitting ? "Logging..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
