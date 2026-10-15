import { randomBytes } from "node:crypto";

/**
 * Prefixed, time-sortable identifiers (ULID body, Crockford base32).
 *   cli_01J9Z7Q4X1...   → client
 * Sortable by creation time, which keeps SQLite B-tree inserts append-mostly.
 */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const ID_PREFIX = {
  adminUser: "adm",
  clientUser: "usr",
  client: "cli",
  contact: "cnt",
  project: "prj",
  contract: "ctr",
  contractItem: "cti",
  billingPeriod: "bpd",
  invoice: "inv",
  invoiceLine: "inl",
  payment: "pay",
  creditNote: "crn",
  apiKey: "key",
  server: "srv",
  process: "prc",
  processAction: "act",
  release: "rel",
  vaultItem: "vlt",
  webhook: "whk",
  webhookDelivery: "whd",
  ticket: "tkt",
  ticketMessage: "tkm",
  ticketEvent: "tke",
  slaPolicy: "sla",
  domain: "dom",
  incident: "inc",
  statusPage: "stp",
  event: "evt",
  audit: "aud",
  notification: "ntf",
  attachment: "att",
  analyticsSink: "snk",
  request: "req",
  metric: "met",
  embedToken: "emb",
  cannedReply: "cnr",
  changelog: "chg",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(time: number): string {
  let out = "";
  for (let i = 9; i >= 0; i--) {
    const mod = time % 32;
    out = ENCODING[mod] + out;
    time = (time - mod) / 32;
  }
  return out;
}

function randomChars(): number[] {
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => b % 32);
}

/** Monotonic ULID: ids generated within the same millisecond still sort correctly. */
export function ulid(now: number = Date.now()): string {
  if (now === lastTime) {
    // increment previous random component
    const next = [...lastRandom];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i]! < 31) {
        next[i]!++;
        break;
      }
      next[i] = 0;
    }
    lastRandom = next;
  } else {
    lastTime = now;
    lastRandom = randomChars();
  }
  return encodeTime(now) + lastRandom.map((n) => ENCODING[n]).join("");
}

export function newId<P extends IdPrefix>(prefix: P): `${P}_${string}` {
  return `${prefix}_${ulid()}`;
}

export function hasPrefix(id: string, prefix: IdPrefix): boolean {
  return id.startsWith(`${prefix}_`);
}
