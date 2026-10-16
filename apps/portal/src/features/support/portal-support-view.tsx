"use client";

import { useState, useEffect, useRef } from "react";
import {
  LifeBuoy,
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  Flame,
  PlusCircle,
  Headphones,
  MessageSquare,
  Star,
  ShieldCheck,
  X,
  Search,
  User,
  Terminal,
  Sparkles,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import type { SerializedTicket } from "./admin-support-view";

export interface IncidentItem {
  id: string;
  type: string;
  status: string;
  startedAt: number;
  resolvedAt?: number | null;
  summary: string;
}

export interface TicketMessageItem {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderType: "client" | "staff" | "system";
  body: string;
  isInternal: boolean;
  createdAt: number;
}

interface PortalSupportViewProps {
  clientId: string;
  clientName: string;
  userEmail: string;
  userRole: string;
  initialTickets?: SerializedTicket[];
  incidents?: IncidentItem[];
}

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

export function PortalSupportView({
  clientId,
  clientName,
  userEmail,
  userRole,
  initialTickets = [],
  incidents = [],
}: PortalSupportViewProps) {
  const { showSuccess, showError } = useAlert();
  const [tickets, setTickets] = useState<SerializedTicket[]>(initialTickets);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Split-pane active ticket
  const [activeTicket, setActiveTicket] = useState<SerializedTicket | null>(
    () => initialTickets[0] ?? null
  );
  const [messages, setMessages] = useState<TicketMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Self-service escalation modal with reason prompt
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [escalating, setEscalating] = useState(false);

  // CSAT state
  const [csatRating, setCsatRating] = useState<number>(5);
  const [csatFeedback, setCsatFeedback] = useState<string>("");
  const [submittingCsat, setSubmittingCsat] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    subject: "",
    priority: "P3" as "P1" | "P2" | "P3" | "P4",
    category: "question" as
      | "bug"
      | "outage"
      | "change-request"
      | "billing"
      | "access"
      | "question",
    message: "",
  });

  const activeTicketRef = useRef<SerializedTicket | null>(activeTicket);
  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  // Realtime SSE Listener for instant ticket updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      const sseUrl = `/api/stream?topics=client:${clientId}:tickets,tickets`;
      es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "ticket.updated") {
            const updatedTicket = data.payload || data.data;
            if (updatedTicket) {
              setTickets((prev) =>
                prev.map((t) =>
                  t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t
                )
              );
              if (
                activeTicketRef.current &&
                activeTicketRef.current.id === updatedTicket.id
              ) {
                setActiveTicket((prev) =>
                  prev ? { ...prev, ...updatedTicket } : null
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
              activeTicketRef.current &&
              payload.ticketId === activeTicketRef.current.id
            ) {
              const mappedMsg: TicketMessageItem = {
                id: payload.id,
                ticketId: payload.ticketId,
                senderId: payload.senderId || payload.authorId || "",
                senderName:
                  payload.senderName ||
                  payload.authorName ||
                  (payload.authorType === "admin"
                    ? "RapidShift Support"
                    : "Client"),
                senderType: (payload.senderType ||
                  (payload.authorType === "admin"
                    ? "staff"
                    : payload.authorType) ||
                  "client") as any,
                body: payload.body,
                isInternal: Boolean(payload.isInternal),
                createdAt: payload.createdAt || Date.now(),
              };

              if (!mappedMsg.isInternal) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === mappedMsg.id)) return prev;
                  return [...prev, mappedMsg];
                });
              }
            }
          }
        } catch (parseErr) {
          console.warn("[PortalSupportView] SSE Parse error:", parseErr);
        }
      };
      es.onerror = (err) => {
        console.warn("[PortalSupportView] SSE Connection warning:", err);
      };
    } catch (sseErr) {
      console.warn("[PortalSupportView] SSE Connection init error:", sseErr);
    }

    return () => {
      if (es) es.close();
    };
  }, [clientId]);

  // Fetch messages when activeTicket changes
  useEffect(() => {
    if (!activeTicket) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setLoadingMessages(true);

    fetch(`/api/v1/tickets/${activeTicket.id}/messages`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!isMounted) return;
        const rawList = Array.isArray(data)
          ? data
          : data.data || data.items || data.messages || [];

        const publicOnly = rawList
          .filter((m: any) => !m.isInternal)
          .map((m: any) => ({
            id: m.id,
            ticketId: m.ticketId,
            senderId: m.senderId || m.authorId || "",
            senderName:
              m.senderName ||
              m.authorName ||
              (m.authorType === "admin" ? "RapidShift Support" : userEmail),
            senderType: (m.senderType ||
              (m.authorType === "admin" ? "staff" : m.authorType) ||
              "client") as any,
            body: m.body,
            isInternal: Boolean(m.isInternal),
            createdAt: m.createdAt || Date.now(),
          }));

        setMessages(publicOnly);
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
  }, [activeTicket?.id, userEmail]);

  const filteredTickets = tickets.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      t.subject.toLowerCase().includes(q) ||
      t.number.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q);
    const matchesPriority =
      priorityFilter === "all" || t.priority === priorityFilter;
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;

    try {
      setSendingReply(true);
      const res = await fetch(`/api/v1/tickets/${activeTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyText.trim(),
          isInternal: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to post message");
      }

      const msgData = data.data || data;
      const newMsg: TicketMessageItem = {
        id: msgData.id || `msg_${Date.now().toString(36)}`,
        ticketId: activeTicket.id,
        senderId: msgData.senderId || clientId,
        senderName: msgData.senderName || userEmail,
        senderType: "client",
        body: msgData.body || replyText.trim(),
        isInternal: false,
        createdAt: msgData.createdAt || Date.now(),
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setReplyText("");
      showSuccess(
        "Message Sent",
        "Your response has been added to the live ticket thread."
      );
    } catch (err: any) {
      showError(
        "Reply Failed",
        err.message || "Could not deliver your reply."
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleConfirmEscalate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;

    try {
      setEscalating(true);
      const reason =
        escalationReason.trim() ||
        "Client requested urgent escalation via portal SLA command center";
      const res = await fetch(`/api/v1/tickets/${activeTicket.id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to escalate");
      }
      const nextTier = activeTicket.level === "L1" ? "L2" : "L3";
      const updated = {
        ...activeTicket,
        level: nextTier as any,
        status: "escalated" as any,
      };
      setTickets((prev) =>
        prev.map((t) => (t.id === activeTicket.id ? updated : t))
      );
      setActiveTicket(updated);
      setShowEscalateModal(false);
      setEscalationReason("");
      showSuccess(
        `Escalated to ${nextTier}`,
        `Ticket ${activeTicket.number} escalated to Tier ${nextTier.slice(
          1
        )} engineering lead.`
      );
    } catch (err: any) {
      showError(
        "Escalation Failed",
        err.message || "Failed to escalate ticket."
      );
    } finally {
      setEscalating(false);
    }
  };

  const handleSubmitCsat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;

    try {
      setSubmittingCsat(true);
      const res = await fetch(`/api/v1/tickets/${activeTicket.id}/csat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: csatRating,
          feedback: csatFeedback.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to record rating");
      }

      const updated = { ...activeTicket, csatRating };
      setTickets((prev) =>
        prev.map((t) => (t.id === activeTicket.id ? updated : t))
      );
      setActiveTicket(updated);
      showSuccess(
        "Feedback Recorded",
        "Thank you for rating our support engineering team!"
      );
    } catch (err: any) {
      showError(
        "Submission Failed",
        err.message || "Could not record feedback."
      );
    } finally {
      setSubmittingCsat(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) {
      showError(
        "Validation Error",
        "Please provide a subject and detailed description."
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          subject: ticketForm.subject.trim(),
          message: ticketForm.message.trim(),
          priority: ticketForm.priority,
          category: ticketForm.category,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register ticket");
      }

      const ticketObj = data.ticket || data.data?.ticket || data;
      const created: SerializedTicket = {
        id: ticketObj.id || data.id,
        number:
          ticketObj.number ||
          data.number ||
          `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: ticketObj.clientId || clientId,
        clientName: clientName,
        category: ticketObj.category || ticketForm.category,
        subject: ticketObj.subject || ticketForm.subject,
        priority: ticketObj.priority || ticketForm.priority,
        level: ticketObj.level || "L1",
        status: ticketObj.status || "open",
        source: ticketObj.source || "portal",
        firstResponseDueAt:
          ticketObj.firstResponseDueAt || Date.now() + 60 * 60 * 1000,
        resolutionDueAt:
          ticketObj.resolutionDueAt || Date.now() + 8 * 60 * 60 * 1000,
        slaBreached: Boolean(ticketObj.slaBreached),
        createdAt: ticketObj.createdAt || Date.now(),
        updatedAt: ticketObj.updatedAt || Date.now(),
      };

      setTickets((prev) => [created, ...prev]);
      setActiveTicket(created);
      setShowCreateModal(false);
      setTicketForm({
        subject: "",
        priority: "P3",
        category: "question",
        message: "",
      });

      showSuccess(
        "Support Ticket Raised",
        `Ticket ${created.number} has been logged. Our 24×7 operations team is on it.`,
        [
          { label: "Ticket Number", value: created.number },
          { label: "Priority", value: created.priority },
          {
            label: "SLA Target",
            value: created.priority === "P1" ? "15 Minutes" : "1 Hour",
          },
        ]
      );
    } catch (err: any) {
      showError(
        "Ticket Submission Failed",
        err.message || "Failed to submit ticket."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "P1":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
      case "P2":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800";
      case "P3":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
      default:
        return "bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header & SLA Guarantee Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                <Headphones className="w-3.5 h-3.5" />
                <span>24×7 Dedicated Technical SLA Desk</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-tech font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                99.9% SLA Response Guarantee
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-steel text-zinc-900 dark:text-white">
              Technical Support &amp; SLA Command Center &bull; {clientName}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* SLA Response Time Indicator Pills */}
            <div className="hidden xl:flex items-center gap-2 text-[11px] font-tech">
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold">
                P1 Critical: 15m
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-bold">
                P2 High: 1h
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold">
                P3 Normal: 4h
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="font-tech font-bold">Raise Support Ticket</span>
            </button>
          </div>
        </div>

        {/* Active Automated Incidents Alert if any */}
        {incidents.length > 0 && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Active Monitor Alert:</strong> {incidents[0].summary}
              </span>
            </div>
            <span className="font-tech text-[11px] text-rose-600">
              {incidents[0].status}
            </span>
          </div>
        )}
      </section>

      {/* True Independent-Scroll Split-Pane Workspace */}
      <div className="lg:h-[calc(100vh-14.5rem)] lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT PANE: Independent-Scroll Ticket List & Priority/Status Filters */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
          <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5 shrink-0 bg-zinc-50/50 dark:bg-zinc-900">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets by #number or subject..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
              >
                <option value="all">Priority: All</option>
                <option value="P1">P1 Critical (15m)</option>
                <option value="P2">P2 High (1h)</option>
                <option value="P3">P3 Normal (4h)</option>
                <option value="P4">P4 Low (24h)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
              >
                <option value="all">Status: All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {filteredTickets.length === 0 ? (
              <div className="p-10 text-center space-y-2.5">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  No Tickets Found
                </div>
                <p className="text-[11px] text-zinc-500">
                  No support tickets match your filter criteria.
                </p>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = activeTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTicket(t)}
                    className={`p-3.5 transition cursor-pointer border-l-4 ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-950/30 border-l-blue-600"
                        : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-tech text-xs font-bold text-blue-600 dark:text-blue-400">
                          {t.number}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(
                            t.priority
                          )}`}
                        >
                          {t.priority}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-tech font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          Tier {t.level}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          t.status === "resolved"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : t.status === "escalated"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                        }`}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-1">
                      {t.subject}
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px] text-zinc-400 font-tech">
                      <span className="capitalize">{t.category}</span>
                      <span>{formatDateTime(t.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Independent-Scroll Conversation Thread & Self-Service Escalation */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
          {!activeTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-white">
                Select or Raise a Support Ticket
              </div>
              <p className="text-xs text-zinc-500 max-w-sm">
                Select a ticket on the left to view live updates from RapidShift Systems Engineering or raise a new support request.
              </p>
            </div>
          ) : (
            <>
              {/* Inspector Header */}
              <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-zinc-50/40 dark:bg-zinc-900">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                      {activeTicket.number}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(
                        activeTicket.priority
                      )}`}
                    >
                      {activeTicket.priority}
                    </span>
                    <span className="text-xs font-semibold uppercase text-zinc-500">
                      Tier {activeTicket.level} Engineering
                    </span>
                    <span className="text-xs text-zinc-400 font-tech">
                      &bull; Resolution Due:{" "}
                      {formatTime(activeTicket.resolutionDueAt)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    {activeTicket.subject}
                  </h3>
                </div>

                {/* Self-Service Escalation Control */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeTicket.status !== "resolved" &&
                    activeTicket.level !== "L3" && (
                      <button
                        type="button"
                        onClick={() => setShowEscalateModal(true)}
                        className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>
                          Escalate to{" "}
                          {activeTicket.level === "L1" ? "L2 Lead" : "L3 Exec"}
                        </span>
                      </button>
                    )}
                </div>
              </div>

              {/* Independent-Scroll Conversation Messages */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* Original Ticket Summary */}
                <div className="p-3.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Logged by {clientName}
                    </span>
                    <span className="font-mono text-[11px]">
                      {formatDateTime(activeTicket.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    {activeTicket.subject}
                  </div>
                </div>

                {loadingMessages ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                    <IosSpinner size="md" className="text-blue-500" />
                    <span>Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    Ticket is in the active engineering queue. Post additional logs or screenshots below at any time.
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

                    const isStaff =
                      m.senderType === "staff" || m.senderType === "system";
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isStaff ? "items-start" : "items-end"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {isStaff ? "RapidShift Support" : m.senderName}
                          </span>
                          <span>&bull;</span>
                          <span className="font-mono">
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`p-3.5 rounded-2xl max-w-lg text-xs leading-relaxed whitespace-pre-wrap ${
                            isStaff
                              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm border border-zinc-200/60 dark:border-zinc-700/60"
                              : "bg-blue-600 text-white rounded-tr-sm"
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* CSAT Form if resolved */}
                {activeTicket.status === "resolved" && (
                  <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-950/60 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Ticket Resolved &bull; Rate Support Experience</span>
                    </div>
                    {activeTicket.csatRating ? (
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                        <span>Your Rating:</span>
                        <div className="flex text-amber-500">
                          {Array.from({ length: activeTicket.csatRating }).map(
                            (_, i) => (
                              <Star
                                key={i}
                                className="w-3.5 h-3.5 fill-current"
                              />
                            )
                          )}
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitCsat} className="space-y-3">
                        <div className="flex items-center gap-1 text-amber-400">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              type="button"
                              key={star}
                              onClick={() => setCsatRating(star)}
                              className="p-1 hover:scale-110 transition cursor-pointer"
                            >
                              <Star
                                className={`w-5 h-5 ${
                                  star <= csatRating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-zinc-300"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Optional feedback comment..."
                          value={csatFeedback}
                          onChange={(e) => setCsatFeedback(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        />
                        <button
                          type="submit"
                          disabled={submittingCsat}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          {submittingCsat
                            ? "Saving..."
                            : "Submit CSAT Feedback"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Fixed Bottom Reply Input Box */}
              {activeTicket.status !== "resolved" &&
                activeTicket.status !== "closed" && (
                  <form
                    onSubmit={handleSendReply}
                    className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      placeholder="Type your reply to the support engineering team..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                )}
            </>
          )}
        </div>
      </div>

      {/* Self-Service Escalation Modal with Reason Prompt */}
      {showEscalateModal && activeTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  Escalate {activeTicket.number} to{" "}
                  {activeTicket.level === "L1" ? "Tier 2" : "Tier 3"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEscalateModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEscalate} className="space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Escalating this ticket notifies the on-call RapidShift technical duty lead and upgrades its SLA response priority.
              </p>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Escalation Reason / Business Impact *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe business impact or urgency reason for escalating..."
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEscalateModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={escalating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {escalating ? "Escalating..." : "Confirm Escalation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Raise Support Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                  Raise 24×7 Support Ticket
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Route your request directly to our systems engineering queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Subject / Summary *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Memory spike on PM2 worker after background sync"
                  value={ticketForm.subject}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, subject: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={ticketForm.category}
                    onChange={(e) =>
                      setTicketForm({
                        ...ticketForm,
                        category: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="bug">Software Defect / Bug</option>
                    <option value="outage">Service Outage / Downtime</option>
                    <option value="change-request">Change Request</option>
                    <option value="billing">Billing Inquiry</option>
                    <option value="access">Access &amp; Keys</option>
                    <option value="question">General Question</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Priority / SLA
                  </label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) =>
                      setTicketForm({
                        ...ticketForm,
                        priority: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="P1">P1 Critical Outage (15m SLA)</option>
                    <option value="P2">P2 High Degraded (1h SLA)</option>
                    <option value="P3">P3 Normal Priority (4h SLA)</option>
                    <option value="P4">P4 Low Inquiry (24h SLA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Detailed Description *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide context, reproduction steps, affected endpoints, or error stack traces..."
                  value={ticketForm.message}
                  onChange={(e) =>
                    setTicketForm({ ...ticketForm, message: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {(() => {
                const combinedText = `${ticketForm.subject} ${ticketForm.message}`.toLowerCase();
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

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Submitting..." : "Submit Support Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
