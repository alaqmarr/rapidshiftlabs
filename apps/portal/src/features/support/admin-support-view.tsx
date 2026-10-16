"use client";

import { useState, useEffect, useRef } from "react";
import {
  LifeBuoy,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  Plus,
  ShieldAlert,
  MessageSquare,
  Lock,
  Search,
  User,
  Flame,
  Zap,
  Sparkles,
  Check,
  SlidersHorizontal,
  ShieldCheck,
  Terminal,
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
  status:
    | "open"
    | "in_progress"
    | "waiting_on_client"
    | "resolved"
    | "closed"
    | "escalated";
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

const DEFAULT_STAFF_MACROS: CannedReplyOption[] = [
  {
    id: "macro_investigating",
    title: "Investigating incident & checking PM2 logs",
    category: "triage",
    content:
      "Hello — RapidShift Systems Engineering is actively investigating this incident. We are inspecting your PM2 worker logs, container telemetry, and recent deployment traces now. We will post a diagnostic update shortly.",
  },
  {
    id: "macro_resolved_prod",
    title: "Issue resolved & verified on production",
    category: "resolution",
    content:
      "We have identified the root cause, deployed the fix to production, and verified that all `/api/healthz` and synthetic endpoint probes are returning 200 OK. Please let us know if everything looks healthy on your end.",
  },
  {
    id: "macro_awaiting_verification",
    title: "Awaiting client verification",
    category: "followup",
    content:
      "We have applied the requested configuration change and verified service stability in your environment. Could your team please verify the workflow on your side so we can mark this ticket resolved?",
  },
  {
    id: "macro_escalated_l3",
    title: "Escalated to L3 Principal Architect",
    category: "escalation",
    content:
      "This ticket has been escalated to our Tier 3 Principal Infrastructure Lead under P1/P2 incident priority. Direct remediation is underway.",
  },
];

const ESCALATION_MATRIX_INFO: Record<
  "L1" | "L2" | "L3",
  { label: string; badge: string; slaNote: string }
> = {
  L1: {
    label: "L1 Standard",
    badge:
      "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    slaNote: "Frontline Support Triage",
  },
  L2: {
    label: "L2 Senior Engineering",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    slaNote: "Systems & DevOps Engineering",
  },
  L3: {
    label: "L3 Executive / P1 Incident",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    slaNote: "Principal Architect & Incident Commander",
  },
};

const formatDate = (ms: number | string | undefined) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
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

function formatSlaCountdown(
  ticket: SerializedTicket,
  nowMs: number
): { text: string; isBreached: boolean; isResolved: boolean } {
  if (ticket.status === "resolved" || ticket.status === "closed") {
    return {
      text: "SLA Fulfilled (Resolved)",
      isBreached: false,
      isResolved: true,
    };
  }
  const target = ticket.firstRespondedAt
    ? ticket.resolutionDueAt
    : ticket.firstResponseDueAt;
  const diffMs = target - nowMs;
  if (ticket.slaBreached || diffMs <= 0) {
    const overdueMins = Math.max(1, Math.floor(Math.abs(diffMs) / 60000));
    const hrs = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    return {
      text:
        hrs > 0
          ? `BREACHED (-${hrs}h ${mins}m)`
          : `BREACHED (-${mins}m)`,
      isBreached: true,
      isResolved: false,
    };
  }
  const totalMins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return {
    text: hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`,
    isBreached: false,
    isResolved: false,
  };
}

export function AdminSupportView({
  initialTickets,
  clients,
  cannedReplies,
}: AdminSupportViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [tickets, setTickets] = useState<SerializedTicket[]>(initialTickets);
  const [searchQuery, setSearchQuery] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [slaBreachedOnly, setSlaBreachedOnly] = useState<boolean>(false);

  const [selectedTicket, setSelectedTicket] = useState<SerializedTicket | null>(
    () => initialTickets[0] ?? null
  );
  const [messages, setMessages] = useState<AdminTicketMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick SLA countdown every 30s
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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

  // Realtime SSE Listener for tickets and messages
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
              if (
                selectedTicketRef.current &&
                selectedTicketRef.current.id === updated.id
              ) {
                setSelectedTicket((prev) =>
                  prev ? { ...prev, ...updated } : null
                );
              }
            }
          } else if (data && data.type === "ticket.created") {
            const created = data.payload || data.data;
            if (created) {
              setTickets((prev) => [
                created,
                ...prev.filter((t) => t.id !== created.id),
              ]);
            }
          } else if (data && data.type === "ticket.message_added") {
            const payload = data.payload || data.data;
            if (
              payload &&
              selectedTicketRef.current &&
              payload.ticketId === selectedTicketRef.current.id
            ) {
              const newMsg: AdminTicketMessageItem = {
                id: payload.id,
                ticketId: payload.ticketId,
                authorId: payload.authorId || payload.senderId || "",
                authorName: payload.authorName || payload.senderName || "User",
                authorType:
                  payload.authorType ||
                  (payload.senderType === "staff" ? "admin" : "client"),
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
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load"))
      )
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
            (m.senderType === "staff" || m.senderType === "system"
              ? "admin"
              : "client"),
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
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      t.subject.toLowerCase().includes(q) ||
      t.number.toLowerCase().includes(q) ||
      (t.clientName && t.clientName.toLowerCase().includes(q));
    const matchesTenant =
      tenantFilter === "all" || t.clientId === tenantFilter;
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesPriority =
      priorityFilter === "all" || t.priority === priorityFilter;
    const matchesBreach =
      !slaBreachedOnly ||
      t.slaBreached ||
      formatSlaCountdown(t, nowMs).isBreached;
    return (
      matchesSearch &&
      matchesTenant &&
      matchesStatus &&
      matchesPriority &&
      matchesBreach
    );
  });

  const totalCount = tickets.length;
  const openCount = tickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;
  const escalatedCount = tickets.filter(
    (t) => t.status === "escalated" || t.level === "L2" || t.level === "L3"
  ).length;
  const breachedCount = tickets.filter(
    (t) => t.slaBreached || formatSlaCountdown(t, nowMs).isBreached
  ).length;

  const combinedMacros: CannedReplyOption[] = [
    ...DEFAULT_STAFF_MACROS,
    ...cannedReplies.filter(
      (cr) => !DEFAULT_STAFF_MACROS.some((dm) => dm.title === cr.title)
    ),
  ];

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.subject.trim() || !newTicket.clientId) {
      showError(
        "Validation Error",
        "Please provide a client and subject for the ticket."
      );
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
        number:
          ticketObj.number ||
          data.number ||
          `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: ticketObj.clientId || newTicket.clientId,
        clientName: clientObj?.name || newTicket.clientId,
        category: ticketObj.category || newTicket.category,
        subject: ticketObj.subject || newTicket.subject,
        priority: ticketObj.priority || newTicket.priority,
        level: ticketObj.level || "L1",
        status: ticketObj.status || "open",
        source: ticketObj.source || "admin",
        firstResponseDueAt:
          ticketObj.firstResponseDueAt || Date.now() + 60 * 60 * 1000,
        resolutionDueAt:
          ticketObj.resolutionDueAt || Date.now() + 8 * 60 * 60 * 1000,
        slaBreached: Boolean(ticketObj.slaBreached),
        createdAt: ticketObj.createdAt || Date.now(),
        updatedAt: ticketObj.updatedAt || Date.now(),
      };

      setTickets((prev) => [created, ...prev]);
      setSelectedTicket(created);
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
        `Ticket ${created.number} has been logged under ${
          clientObj?.name || "client account"
        }. SLA tracking initiated.`,
        [
          { label: "Ticket Number", value: created.number },
          { label: "Priority", value: created.priority },
          { label: "Client ID", value: created.clientId },
        ]
      );
    } catch (err: any) {
      showError(
        "Ticket Creation Failed",
        err.message || "An unexpected error occurred."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    ticket: SerializedTicket,
    newStatus: string
  ) => {
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

      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? updated : t))
      );
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(updated);
      }

      showSuccess(
        "Ticket Status Updated",
        `Ticket ${ticket.number} status set to "${newStatus.replace(
          "_",
          " "
        )}".`
      );
    } catch (err: any) {
      showError(
        "Status Update Failed",
        err.message || "Could not update ticket status."
      );
    }
  };

  const handleEscalate = (
    ticket: SerializedTicket,
    targetLevelOverride?: "L2" | "L3"
  ) => {
    const nextLevel =
      targetLevelOverride || (ticket.level === "L1" ? "L2" : "L3");
    showAlert({
      type: "warning",
      title: `Escalate Ticket to ${ESCALATION_MATRIX_INFO[nextLevel].label}?`,
      description: `Advancing this ticket to ${nextLevel} (${ESCALATION_MATRIX_INFO[nextLevel].slaNote}) triggers priority paging and modifies resolution SLA enforcement.`,
      details: [
        { label: "Ticket Number", value: ticket.number },
        { label: "Current Level", value: ticket.level },
        {
          label: "Target Escalation Tier",
          value: ESCALATION_MATRIX_INFO[nextLevel].label,
        },
        { label: "Client", value: ticket.clientName || ticket.clientId },
      ],
      primaryAction: {
        label: `Confirm Escalation to ${nextLevel}`,
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/tickets/${ticket.id}/escalate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reason: `Operational escalation to ${ESCALATION_MATRIX_INFO[nextLevel].label} by staff`,
              }),
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
            setTickets((prev) =>
              prev.map((t) => (t.id === ticket.id ? updated : t))
            );
            if (selectedTicket?.id === ticket.id) setSelectedTicket(updated);

            showSuccess(
              `Ticket Escalated to ${nextLevel}`,
              `Ticket ${ticket.number} is now managed under ${ESCALATION_MATRIX_INFO[nextLevel].label} emergency SLA procedures.`
            );
          } catch (err: any) {
            showError(
              "Escalation Failed",
              err.message || "Failed to escalate ticket."
            );
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
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicket.id ? updated : t))
        );
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

  const priorityColors = {
    P1: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    P2: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    P3: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    P4: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  };

  const statusColors = {
    open: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
    in_progress:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
    waiting_on_client:
      "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400",
    escalated:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400",
    resolved:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400",
    closed:
      "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-500",
  };

  return (
    <div className="space-y-4">
      {/* Compact Command Header & Telemetry Strip */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>24×7 Support Desk &amp; SLA Command Center</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-tech font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SSE Live Stream Active
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-steel text-zinc-900 dark:text-white">
              Support Queue, Escalation Matrix &amp; SLA Inspector
            </h1>
          </div>

          {/* Inline KPI Pills + Create Ticket */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-xs font-tech">
              <span className="text-zinc-400 mr-1.5">Total:</span>
              <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                {totalCount}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs font-tech">
              <span className="text-blue-600 dark:text-blue-400 mr-1.5">
                Active:
              </span>
              <span className="font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                {openCount}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs font-tech">
              <span className="text-amber-600 dark:text-amber-400 mr-1.5">
                Escalated (L2/L3):
              </span>
              <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                {escalatedCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSlaBreachedOnly((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-tech transition cursor-pointer ${
                slaBreachedOnly
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300"
              }`}
            >
              <span className="mr-1.5">SLA Breached:</span>
              <span className="font-bold tabular-nums">{breachedCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs shadow-sm transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="font-tech font-bold">Log Ticket</span>
            </button>
          </div>
        </div>
      </div>

      {/* True Independent-Scroll Split-Pane Workspace */}
      <div className="lg:h-[calc(100vh-14.5rem)] lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT PANE: Filterable Independent-Scroll Ticket Queue */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
          {/* Left Queue Header & Filters */}
          <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search #number, subject, tenant..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech truncate"
              >
                <option value="all">Tenant: All</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
              >
                <option value="all">Priority: All</option>
                <option value="P1">P1 (15m)</option>
                <option value="P2">P2 (1h)</option>
                <option value="P3">P3 (4h)</option>
                <option value="P4">P4 (24h)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 text-[11px] font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
              >
                <option value="all">Status: All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_on_client">Waiting</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Independent Scroll Ticket List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {filteredTickets.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <LifeBuoy className="w-6 h-6 text-zinc-400 mx-auto" />
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  No Matching Tickets
                </div>
                <p className="text-[11px] text-zinc-500">
                  Adjust tenant, priority, or SLA filters above.
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                const sla = formatSlaCountdown(ticket, nowMs);
                const matrix =
                  ESCALATION_MATRIX_INFO[ticket.level] ||
                  ESCALATION_MATRIX_INFO.L1;

                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`p-3.5 transition cursor-pointer border-l-4 ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-950/30 border-l-blue-600"
                        : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-tech text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          {ticket.number}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            priorityColors[ticket.priority]
                          }`}
                        >
                          {ticket.priority}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${matrix.badge}`}
                        >
                          {matrix.label}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                          statusColors[ticket.status]
                        }`}
                      >
                        {ticket.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-1">
                      {ticket.subject}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
                      <span className="text-zinc-500 truncate">
                        {ticket.clientName || ticket.clientId}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 font-tech font-semibold shrink-0 ${
                          sla.isBreached
                            ? "text-rose-600 dark:text-rose-400"
                            : sla.isResolved
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {sla.isBreached ? (
                          <Flame className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>{sla.text}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Independent-Scroll Live Conversation & SLA Inspector */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-white">
                Select a Ticket from the Queue
              </div>
              <p className="text-xs text-zinc-500 max-w-sm">
                Choose any incident ticket on the left to inspect its SLA breach countdown, escalation tier matrix, and live conversation thread.
              </p>
            </div>
          ) : (
            <>
              {/* Inspector Header & Escalation Matrix Bar */}
              <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 space-y-3 shrink-0 bg-zinc-50/40 dark:bg-zinc-900">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded">
                        {selectedTicket.number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          priorityColors[selectedTicket.priority]
                        }`}
                      >
                        {selectedTicket.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          ESCALATION_MATRIX_INFO[selectedTicket.level].badge
                        }`}
                      >
                        {ESCALATION_MATRIX_INFO[selectedTicket.level].label}
                      </span>
                      <span className="text-xs text-zinc-500">
                        &bull; Tenant:{" "}
                        <strong className="text-zinc-800 dark:text-zinc-200">
                          {selectedTicket.clientName || selectedTicket.clientId}
                        </strong>
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white truncate">
                      {selectedTicket.subject}
                    </h2>
                  </div>

                  {/* Status & Escalation Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={selectedTicket.status}
                      onChange={(e) =>
                        handleStatusChange(selectedTicket, e.target.value)
                      }
                      className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-tech font-semibold"
                    >
                      <option value="open">Status: Open</option>
                      <option value="in_progress">Status: In Progress</option>
                      <option value="waiting_on_client">
                        Status: Waiting Client
                      </option>
                      <option value="escalated">Status: Escalated</option>
                      <option value="resolved">Status: Resolved</option>
                      <option value="closed">Status: Closed</option>
                    </select>

                    {selectedTicket.level !== "L3" && (
                      <button
                        type="button"
                        onClick={() => handleEscalate(selectedTicket)}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-tech font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>
                          Escalate to{" "}
                          {selectedTicket.level === "L1" ? "L2" : "L3"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* SLA Breach Countdown & 3-Tier Escalation Matrix Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  {(() => {
                    const sla = formatSlaCountdown(selectedTicket, nowMs);
                    return (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          sla.isBreached
                            ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                            : "bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            SLA Breach Countdown
                          </div>
                          <div
                            className={`text-xs font-bold font-tech mt-0.5 ${
                              sla.isBreached
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {sla.text}
                          </div>
                        </div>
                        <Clock
                          className={`w-4 h-4 ${
                            sla.isBreached
                              ? "text-rose-500 animate-pulse"
                              : "text-emerald-500"
                          }`}
                        />
                      </div>
                    );
                  })()}

                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Response / Resolution Targets
                    </div>
                    <div className="text-xs font-bold font-tech text-zinc-800 dark:text-zinc-200 mt-0.5">
                      1st: {formatTime(selectedTicket.firstResponseDueAt)}{" "}
                      &bull; Res: {formatTime(selectedTicket.resolutionDueAt)}
                    </div>
                  </div>

                  {/* Interactive Escalation Matrix Indicator */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Escalation Matrix
                      </div>
                      <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                        {ESCALATION_MATRIX_INFO[selectedTicket.level].slaNote}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(["L1", "L2", "L3"] as const).map((lvl) => (
                        <span
                          key={lvl}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-tech font-bold ${
                            selectedTicket.level === lvl
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {lvl}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Independent-Scroll Conversation Thread */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                {/* Initial Ticket Issue Description */}
                <div className="p-3.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 mb-1">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span>
                        Reported by{" "}
                        {selectedTicket.clientName || selectedTicket.clientId}
                      </span>
                    </span>
                    <span className="font-mono text-[11px]">
                      {formatDateTime(selectedTicket.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                    {selectedTicket.category} &bull; Priority{" "}
                    {selectedTicket.priority} &bull; Via {selectedTicket.source}
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 mt-1.5 font-medium">
                    {selectedTicket.subject}
                  </p>
                </div>

                {loadingMessages ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                    <IosSpinner size="md" className="text-blue-500" />
                    <span>Loading conversation thread...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    No messages posted yet. Click a Quick Macro below or type a response to dispatch.
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.body && m.body.trim().startsWith("[SYSTEM TELEMETRY SNAPSHOT]")) {
                      const rows = m.body
                        .split("\n")
                        .map((l) => l.trim())
                        .filter((l) => l && !l.startsWith("[SYSTEM TELEMETRY SNAPSHOT]"))
                        .map((l) => {
                          const cleaned = l.replace(/^[•\-*]\s*/, "");
                          const idx = cleaned.indexOf(":");
                          if (idx === -1) return { label: "Telemetry", value: cleaned };
                          return {
                            label: cleaned.slice(0, idx).trim(),
                            value: cleaned.slice(idx + 1).trim(),
                          };
                        });

                      return (
                        <div
                          key={m.id}
                          className="rounded-2xl border border-emerald-500/30 dark:border-emerald-700/50 bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/50 dark:from-emerald-950/25 dark:via-zinc-900 dark:to-blue-950/25 p-4 shadow-xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-emerald-200/70 dark:border-emerald-800/50 pb-2">
                            <span className="inline-flex items-center gap-1.5 font-tech text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                              Live System Telemetry Snapshot
                            </span>
                            <span className="font-mono text-[11px] text-zinc-400">
                              {formatDateTime(m.createdAt)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rows.map((r, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-white/90 dark:bg-zinc-950/70 border border-zinc-200/70 dark:border-zinc-800 text-xs"
                              >
                                <div className="text-[10px] font-tech font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                  {r.label}
                                </div>
                                <div className="text-zinc-800 dark:text-zinc-200 font-medium mt-0.5 leading-snug">
                                  {r.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (m.isInternal) {
                      return (
                        <div
                          key={m.id}
                          className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 dark:text-amber-400 text-[11px] uppercase tracking-wider">
                              <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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

                    const isStaff =
                      m.authorType === "admin" || m.authorType === "system";

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isStaff ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {isStaff
                              ? `Staff: ${m.authorName}`
                              : `${
                                  selectedTicket.clientName || "Client"
                                }: ${m.authorName}`}
                          </span>
                          <span>&bull;</span>
                          <span className="font-mono">
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`p-3.5 rounded-2xl max-w-xl text-xs leading-relaxed ${
                            isStaff
                              ? "bg-blue-600 text-white rounded-tr-sm"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm border border-zinc-200/60 dark:border-zinc-700/60"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{m.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Composer: One-Click Staff Quick Macros + Reply / Internal Note Box */}
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 space-y-2.5 shrink-0">
                {/* One-Click Staff Quick Macros */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] font-tech font-bold uppercase tracking-wider text-zinc-400 shrink-0 flex items-center gap-1 mr-1">
                    <Zap className="w-3 h-3 text-blue-500" />
                    Quick Macros:
                  </span>
                  {combinedMacros.map((macro) => (
                    <button
                      key={macro.id}
                      type="button"
                      onClick={() => setReplyText(macro.content)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition cursor-pointer"
                    >
                      {macro.title}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        !isInternalNote
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      Public Client Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer ${
                        isInternalNote
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      Internal Staff Note
                    </button>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isInternalNote
                        ? "Record an internal engineering note (hidden from client)..."
                        : "Type response or click a Quick Macro above..."
                    }
                    rows={2}
                    className="flex-1 p-2.5 text-xs sm:text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    disabled={submitting || !replyText.trim()}
                    onClick={handleSendReply}
                    className={`px-4 py-2.5 rounded-xl text-white font-semibold text-xs shadow-sm transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                      isInternalNote
                        ? "bg-amber-600 hover:bg-amber-500"
                        : "bg-blue-600 hover:bg-blue-500"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isInternalNote ? "Save Note" : "Send Reply"}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Log Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-blue-600" />
                Log Support Ticket
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
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
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, clientId: e.target.value })
                  }
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
                    onChange={(e) =>
                      setNewTicket({ ...newTicket, category: e.target.value })
                    }
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
                    onChange={(e) =>
                      setNewTicket({
                        ...newTicket,
                        priority: e.target.value as any,
                      })
                    }
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
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, subject: e.target.value })
                  }
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
                  onChange={(e) =>
                    setNewTicket({
                      ...newTicket,
                      initialMessage: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {(() => {
                const combinedText = `${newTicket.subject} ${newTicket.initialMessage}`.toLowerCase();
                const criticalKeywords = [
                  "502",
                  "500",
                  "down",
                  "outage",
                  "crash",
                  "ssl expired",
                  "payment failed",
                ];
                const matchedKeyword = criticalKeywords.find((kw) =>
                  combinedText.includes(kw)
                );
                return (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      matchedKeyword
                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                        : "bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-tech font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
                        <span>Smart Context-Aware Triage</span>
                        {matchedKeyword && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px]">
                            Urgent Signal: &ldquo;{matchedKeyword}&rdquo;
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed">
                        Smart Auto-Triage Active: Live PM2, Domain SSL, and Contract Tenure telemetry will be automatically attached to this ticket.
                      </p>
                    </div>
                  </div>
                );
              })()}

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
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
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
