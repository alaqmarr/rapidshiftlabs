import { z } from "zod";

export const CreateTicketSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  category: z
    .enum(["bug", "outage", "change-request", "billing", "access", "question"])
    .default("question"),
  subject: z.string().min(3).max(255),
  message: z.string().min(1),
  priority: z.enum(["P1", "P2", "P3", "P4"]).default("P3"),
  assigneeId: z.string().optional().nullable(),
  assigneeName: z.string().optional().nullable(),
  source: z.enum(["portal", "admin", "system", "email", "api"]).default("portal"),
  linkedIncidentId: z.string().optional().nullable(),
  linkedProcessId: z.string().optional().nullable(),
});

export type CreateTicketDTO = z.infer<typeof CreateTicketSchema>;

export const AddMessageSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

export type AddMessageDTO = z.infer<typeof AddMessageSchema>;

export const EscalateTicketSchema = z.object({
  ticketId: z.string().min(1),
  reason: z.string().min(3),
  targetLevel: z.enum(["L1", "L2", "L3"]).optional(),
});

export type EscalateTicketDTO = z.infer<typeof EscalateTicketSchema>;

export const UpdateStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum([
    "open",
    "in_progress",
    "waiting_on_client",
    "resolved",
    "closed",
    "escalated",
  ]),
  reason: z.string().optional(),
});

export type UpdateStatusDTO = z.infer<typeof UpdateStatusSchema>;

export const SubmitCsatSchema = z.object({
  ticketId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().optional(),
});

export type SubmitCsatDTO = z.infer<typeof SubmitCsatSchema>;
