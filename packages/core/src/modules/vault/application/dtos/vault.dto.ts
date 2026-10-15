import { z } from "zod";

export const CreateCredentialSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  name: z.string().min(2).max(100),
  category: z
    .enum(["database", "smtp", "api_key", "server_ssh", "env_file", "other"])
    .default("other"),
  username: z.string().optional().nullable(),
  secretValue: z.string().min(1), // Plaintext submitted, encrypted before store
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  expiresAt: z.number().optional().nullable(),
  oneTimeReveal: z.boolean().default(false),
});

export type CreateCredentialDTO = z.infer<typeof CreateCredentialSchema>;
