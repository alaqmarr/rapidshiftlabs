import { ValidationError } from "../../../../shared/kernel/errors";
import type { ProcessStatus } from "../../domain/entities/pm2-process.entity";

export interface DiscoveredPm2Process {
  pmId: number;
  name: string;
  pid: number | null;
  status: ProcessStatus;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
}

export class Pm2Parser {
  public static parseJlist(rawOutput: string): DiscoveredPm2Process[] {
    // 1. Strip ANSI escape sequences
    const stripped = rawOutput.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").trim();

    // If completely empty output, return empty array
    if (stripped.length === 0) {
      return [];
    }

    // 2. Locate start of JSON array, ignoring [PM2] banner tags like [PM2] Spawning daemon...
    const match = stripped.match(/\[\s*(\{|\])/);
    if (!match || match.index === undefined) {
      throw new ValidationError("No JSON process array found in PM2 output", { rawOutput });
    }

    const firstBracket = match.index;
    const lastBracket = stripped.lastIndexOf("]");
    if (lastBracket === -1 || lastBracket < firstBracket) {
      throw new ValidationError("Incomplete PM2 JSON array output", { rawOutput });
    }

    const jsonString = stripped.slice(firstBracket, lastBracket + 1);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err: any) {
      throw new ValidationError(`Failed to parse PM2 JSON: ${err.message}`, { rawOutput });
    }

    if (!Array.isArray(parsed)) {
      throw new ValidationError("Expected PM2 output to be an array", { rawOutput });
    }

    return parsed.map((item: any, idx: number) => {
      const pmId = typeof item.pm_id === "number" ? item.pm_id : Number(item.pm_id);
      if (!Number.isInteger(pmId) || pmId < 0) {
        throw new ValidationError(`Invalid pm_id at index ${idx}`, { item });
      }

      const name = String(item.name || `process-${pmId}`);
      const pid = typeof item.pid === "number" ? item.pid : null;
      const monit = item.monit || {};
      const cpu = typeof monit.cpu === "number" ? Math.round(monit.cpu) : 0;
      const memory = typeof monit.memory === "number" ? Math.round(monit.memory) : 0;

      const pm2Env = item.pm2_env || {};
      const rawStatus = String(pm2Env.status || "unknown").toLowerCase();
      const validStatuses: ProcessStatus[] = [
        "online",
        "stopping",
        "stopped",
        "launching",
        "errored",
        "one-launch-status",
      ];
      const status: ProcessStatus = validStatuses.includes(rawStatus as ProcessStatus)
        ? (rawStatus as ProcessStatus)
        : "unknown";

      const restarts = typeof pm2Env.restart_time === "number" ? pm2Env.restart_time : 0;
      const uptimeMs =
        typeof pm2Env.pm_uptime === "number" && pm2Env.pm_uptime > 0
          ? Math.max(0, Date.now() - pm2Env.pm_uptime)
          : 0;

      return {
        pmId,
        name,
        pid,
        status,
        cpu,
        memory,
        restarts,
        uptimeMs,
      };
    });
  }
}
