import { ValidationError } from "../../../../shared/kernel/errors";

export class CommandSanitizationError extends ValidationError {
  constructor(message: string) {
    super(`Command validation failed: ${message}`);
  }
}

export class FleetCommandSanitizer {
  public static readonly ALLOWLIST_REGEX =
    /^(pm2 jlist|pm2 restart \d{1,6}|pm2 logs \d{1,6} --nostream --lines \d{1,4}|cat \/proc\/loadavg \/proc\/meminfo \/proc\/uptime|cat \/proc\/loadavg \/proc\/meminfo \/proc\/uptime \/etc\/os-release; df -Pk \/; uname -r -m; nproc)$/;

  public static validateInteger(
    paramName: string,
    value: unknown,
    min: number,
    max: number
  ): number {
    if (typeof value === "string") {
      if (!/^\d+$/.test(value.trim())) {
        throw new CommandSanitizationError(
          `Parameter '${paramName}' must contain only digits`
        );
      }
    } else if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new CommandSanitizationError(
        `Parameter '${paramName}' must be an integer`
      );
    }

    const num = Number(value);
    if (!Number.isSafeInteger(num) || num < min || num > max) {
      throw new CommandSanitizationError(
        `Parameter '${paramName}' value ${num} is out of valid range [${min}, ${max}]`
      );
    }
    return num;
  }

  public static buildJlistCommand(): string {
    return "pm2 jlist";
  }

  public static buildMetricsProbeCommand(): string {
    return "cat /proc/loadavg /proc/meminfo /proc/uptime";
  }

  public static buildStatsProbeCommand(): string {
    return "cat /proc/loadavg /proc/meminfo /proc/uptime /etc/os-release; df -Pk /; uname -r -m; nproc";
  }

  public static buildRestartCommand(pm2Id: number | string): string {
    const validId = this.validateInteger("pm2Id", pm2Id, 0, 100_000);
    return `pm2 restart ${validId}`;
  }

  public static buildLogsCommand(pm2Id: number | string, lines: number | string = 100): string {
    const validId = this.validateInteger("pm2Id", pm2Id, 0, 100_000);
    const validLines = this.validateInteger("lines", lines, 1, 1_000);
    return `pm2 logs ${validId} --nostream --lines ${validLines}`;
  }

  public static assertAllowlisted(command: string): void {
    if (!this.ALLOWLIST_REGEX.test(command.trim())) {
      throw new CommandSanitizationError(`Command is not allowlisted: ${command}`);
    }
  }
}
