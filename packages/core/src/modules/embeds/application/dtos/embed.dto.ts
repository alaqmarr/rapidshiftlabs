import { z } from "zod";
import { PERMISSIONS } from "../../../../shared/kernel/actor";

export const MintEmbedTokenSchema = z
  .object({
    clientId: z.string().min(1),
    scopes: z.array(z.enum(PERMISSIONS as any)).min(1),
    allowedOrigins: z.array(z.string()).optional(),
    ttlMs: z.number().int().min(60000).max(366 * 86400000).optional(), // up to 1 year
    ttlSeconds: z.number().int().min(60).max(366 * 86400).optional(),
    expiresInMs: z.number().int().min(60000).max(366 * 86400000).optional(),
  })
  .transform((data) => ({
    clientId: data.clientId,
    scopes: data.scopes,
    allowedOrigins: data.allowedOrigins,
    ttlMs: data.ttlMs ?? (data.ttlSeconds ? data.ttlSeconds * 1000 : data.expiresInMs),
  }));

export type MintEmbedTokenDTO = z.input<typeof MintEmbedTokenSchema>;
export type MintEmbedTokenOutput = z.output<typeof MintEmbedTokenSchema>;
