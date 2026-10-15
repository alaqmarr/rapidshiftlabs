import { z } from "zod";

export const CreateReleaseSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  name: z.string().min(2).max(100),
  version: z.string().min(1).max(50),
  environment: z.enum(["beta", "staging", "prod"]).default("beta"),
  url: z.string().url(),
  status: z.enum(["active", "archived", "deprecated"]).default("active"),
  releaseNotes: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  expiresAt: z.number().optional().nullable(),
});

export type CreateReleaseDTO = z.infer<typeof CreateReleaseSchema>;

export const UpdateReleaseSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  version: z.string().min(1).max(50).optional(),
  environment: z.enum(["beta", "staging", "prod"]).optional(),
  url: z.string().url().optional(),
  status: z.enum(["active", "archived", "deprecated"]).optional(),
  releaseNotes: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  expiresAt: z.number().optional().nullable(),
});

export type UpdateReleaseDTO = z.infer<typeof UpdateReleaseSchema>;
