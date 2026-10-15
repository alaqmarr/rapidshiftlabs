"use client";

import { useState, useEffect, useRef } from "react";
import {
  LifeBuoy,
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  Flame,
  ArrowUpRight,
  PlusCircle,
  Headphones,
  MessageSquare,
  Star,
  ExternalLink,
  ShieldAlert,
  X,
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

export function PortalSupportView({
  clientId,
  clientName,
  userEmail,
  userRole,
  initialTickets = [],
  incidents = [],
}: PortalSupportViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [tickets, setTickets] = useState<SerializedTicket[]>(initialTickets);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Active detail modal/drawer
  const [activeTicket, setActiveTicket] = useState<SerializedTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // CSAT modal state
  const [csatRating, setCsatRating] = useState<number>(5);
  const [csatFeedback, setCsatFeedback] = useState<string>("");
  const [submittingCsat, setSubmittingCsat] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    subject: "",
    priority: "P3" as "P1" | "P2" | "P3" | "P4",
    category: "question" as "bug" | "outage" | "change-request" | "billing" | "access" | "question",
    message: "",
  });

  const activeTicketRef = useRef<SerializedTicket | null>(activeTicket);
  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  // Realtime SSE Listener for instant ticket updates (stable connection)
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
                prev.map((t) => (t.id === updatedTicket.id ? { ...t, ...updatedTicket } : t)),
              );
              if (activeTicketRef.current && activeTicketRef.current.id === updatedTicket.id) {
                setActiveTicket((prev) => (prev ? { ...prev, ...updatedTicket } : null));
              }
            }
          } else if (data && data.type === "ticket.created") {
            const created = data.payload || data.data;
            if (created) {
              setTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
            }
          } else if (data && data.type === "ticket.message_added") {
            const payload = data.payload || data.data;
            if (payload && activeTicketRef.current && payload.ticketId === activeTicketRef.current.id) {
              const mappedMsg: TicketMessageItem = {
                id: payload.id,
                ticketId: payload.ticketId,
                senderId: payload.senderId || payload.authorId || "",
                senderName:
                  payload.senderName ||
                  payload.authorName ||
                  (payload.authorType === "admin" ? "RapidShift Support" : "Client"),
                senderType: (payload.senderType ||
                  (payload.authorType === "admin" ? "staff" : payload.authorType) ||
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

  // Load messages when a ticket is opened
  const handleOpenTicketDetails = async (ticket: SerializedTicket) => {
    setActiveTicket(ticket);
    try {
      setLoadingMessages(true);
      const res = await fetch(`/api/v1/tickets/${ticket.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data)
          ? data
          : data.data || data.items || data.messages || [];

        // Client only sees public messages
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
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

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
      showSuccess("Message Sent", "Your response has been added to the ticket thread.");
    } catch (err: any) {
      showError("Reply Failed", err.message || "Could not deliver your reply.");
    } finally {
      setSendingReply(false);
    }
  };

  const handleClientEscalate = (ticket: SerializedTicket) => {
    showAlert({
      type: "warning",
      title: "Escalate Ticket to Operations Lead?",
      description:
        "Client-initiated escalation flags this ticket as high priority for the RapidShift technical duty manager.",
      details: [
        { label: "Ticket Number", value: ticket.number },
        { label: "Subject", value: ticket.subject },
        { label: "Current Level", value: ticket.level },
      ],
      primaryAction: {
        label: "Confirm Escalation",
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/tickets/${ticket.id}/escalate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Client requested escalation via portal" }),
            });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Failed to escalate");
            }
            const updated = {
              ...ticket,
              level: (ticket.level === "L1" ? "L2" : "L3") as any,
              status: "escalated" as any,
            };
            setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
            if (activeTicket?.id === ticket.id) setActiveTicket(updated);
            showSuccess("Escalation Submitted", "Ticket priority raised. Duty lead notified.");
          } catch (err: any) {
            showError("Escalation Failed", err.message || "Failed to escalate ticket.");
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
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
      setTickets((prev) => prev.map((t) => (t.id === activeTicket.id ? updated : t)));
      setActiveTicket(updated);
      showSuccess("Feedback Recorded", "Thank you for rating our support team!");
    } catch (err: any) {
      showError("Submission Failed", err.message || "Could not record feedback.");
    } finally {
      setSubmittingCsat(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) {
      showError("Validation Error", "Please provide a subject and detailed description.");
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
        number: ticketObj.number || data.number || `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        clientId: ticketObj.clientId || clientId,
        clientName: clientName,
        category: ticketObj.category || ticketForm.category,
        subject: ticketObj.subject || ticketForm.subject,
        priority: ticketObj.priority || ticketForm.priority,
        level: ticketObj.level || "L1",
        status: ticketObj.status || "open",
        source: ticketObj.source || "portal",
        firstResponseDueAt: ticketObj.firstResponseDueAt || Date.now() + 60 * 60 * 1000,
        resolutionDueAt: ticketObj.resolutionDueAt || Date.now() + 8 * 60 * 60 * 1000,
        slaBreached: Boolean(ticketObj.slaBreached),
        createdAt: ticketObj.createdAt || Date.now(),
        updatedAt: ticketObj.updatedAt || Date.now(),
      };

      setTickets((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setTicketForm({ subject: "", priority: "P3", category: "question", message: "" });

      showSuccess(
        "Support Ticket Raised",
        `Ticket ${created.number} has been logged. Our 24×7 operations team is on it.`,
        [
          { label: "Ticket Number", value: created.number },
          { label: "Priority", value: created.priority },
          { label: "SLA Target", value: created.priority === "P1" ? "15 Minutes" : "1 Hour" },
        ]
      );
    } catch (err: any) {
      showError("Ticket Submission Failed", err.message || "Failed to submit ticket.");
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
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Headphones className="w-3.5 h-3.5" />
              <span>24×7 Dedicated Technical SLA Desk &bull; Realtime Updates</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Technical Support &bull; {clientName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl leading-relaxed font-sans">
              Submit issues directly to RapidShift systems engineering. Track live ticket timelines, escalate critical incidents, and review SLA resolution clocks.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="font-tech font-bold">Raise Support Ticket</span>
            </button>
          </div>
        </div>
      </section>

      {/* SLA Tiers Cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-1.5">
          <div className="steel-metric-label text-rose-600 flex items-center justify-between">
            <span>P1 Critical</span>
            <span className="steel-pill font-tech text-[10px] bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200">
              15m / 4h
            </span>
          </div>
          <div className="text-sm font-bold font-steel text-zinc-900 dark:text-white">Production Down</div>
          <p className="text-[11px] text-zinc-500 font-sans">Service outage or severe degradation</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-1.5">
          <div className="steel-metric-label text-amber-600 flex items-center justify-between">
            <span>P2 High</span>
            <span className="steel-pill font-tech text-[10px] bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200">
              1h / 8h
            </span>
          </div>
          <div className="text-sm font-bold font-steel text-zinc-900 dark:text-white">Degraded Function</div>
          <p className="text-[11px] text-zinc-500 font-sans">Major feature impacted, workaround exists</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-1.5">
          <div className="steel-metric-label text-blue-600 flex items-center justify-between">
            <span>P3 Normal</span>
            <span className="steel-pill font-tech text-[10px] bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200">
              4h / 24h
            </span>
          </div>
          <div className="text-sm font-bold font-steel text-zinc-900 dark:text-white">General Question</div>
          <p className="text-[11px] text-zinc-500 font-sans">Inquiries, configuration assistance</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-1.5">
          <div className="steel-metric-label text-zinc-500 flex items-center justify-between">
            <span>P4 Low</span>
            <span className="steel-pill font-tech text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200">
              24h / 72h
            </span>
          </div>
          <div className="text-sm font-bold font-steel text-zinc-900 dark:text-white">Feature Request</div>
          <p className="text-[11px] text-zinc-500">Minor optimization or documentation</p>
        </div>
      </section>

      {/* Tickets List Table */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-indigo-600" />
              <span>Support Desk Tickets</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live tickets logged for {clientName}. Click any ticket to view messages or reply.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400">Total: {tickets.length}</span>
        </div>

        {tickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-white">No Open Tickets</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              You do not have any open support tickets at this time.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Raise Support Ticket</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                <tr>
                  <th className="steel-metric-label py-3 px-4">Ticket</th>
                  <th className="steel-metric-label py-3 px-4">Subject</th>
                  <th className="steel-metric-label py-3 px-4">Priority</th>
                  <th className="steel-metric-label py-3 px-4">Level</th>
                  <th className="steel-metric-label py-3 px-4">Status</th>
                  <th className="steel-metric-label py-3 px-4">Logged At</th>
                  <th className="steel-metric-label py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => handleOpenTicketDetails(t)}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-tech font-bold text-blue-600 dark:text-blue-400">
                      {t.number}
                    </td>
                    <td className="py-3.5 px-4 font-bold font-steel text-zinc-900 dark:text-white max-w-md truncate">
                      {t.subject}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`steel-pill inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(
                          t.priority
                        )}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold font-tech text-zinc-600 dark:text-zinc-300">
                      {t.level}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`steel-pill inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          t.status === "resolved"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : t.status === "escalated"
                            ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
                            : "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
                        }`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-500 font-tech text-[11px]">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTicketDetails(t);
                        }}
                        className="text-blue-600 dark:text-blue-400 font-semibold font-tech hover:underline cursor-pointer"
                      >
                        Open Thread &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ticket Details & Realtime Conversation Drawer */}
      {activeTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
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
                    Tier {activeTicket.level}
                  </span>
                </div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-1">
                  {activeTicket.subject}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {activeTicket.status !== "resolved" && activeTicket.level !== "L3" && (
                  <button
                    onClick={() => handleClientEscalate(activeTicket)}
                    className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                    title="Escalate ticket to next tier"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Escalate</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTicket(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conversation Thread Messages */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {loadingMessages ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                  <IosSpinner size="md" className="text-indigo-500" />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-400">
                  No replies posted yet. Systems Ops is reviewing your request.
                </div>
              ) : (
                messages.map((m) => {
                  const isStaff = m.senderType === "staff" || m.senderType === "system";
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isStaff ? "items-start" : "items-end"}`}
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
                        className={`p-3.5 rounded-2xl max-w-lg text-xs leading-relaxed ${
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
                <div className="mt-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-950/60 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Ticket Resolved &bull; Rate Support Experience</span>
                  </div>
                  {activeTicket.csatRating ? (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <span>Your Rating:</span>
                      <div className="flex text-amber-500">
                        {Array.from({ length: activeTicket.csatRating }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-current" />
                        ))}
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
                            className="p-1 hover:scale-110 transition"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= csatRating ? "fill-amber-400 text-amber-400" : "text-zinc-300"
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
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        {submittingCsat ? "Saving..." : "Submit CSAT Feedback"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Reply Input Box */}
            {activeTicket.status !== "resolved" && activeTicket.status !== "closed" && (
              <form
                onSubmit={handleSendReply}
                className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Type your reply to the support engineering team..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            )}
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
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={ticketForm.category}
                    onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                    onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                  onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

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
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
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
