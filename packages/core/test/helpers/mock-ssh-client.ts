import type {
  SshClientPort,
  ServerConnectionConfig,
  SshCommandResult,
} from "../../src/modules/fleet/domain/ports/ssh-client.port";
import { FleetCommandSanitizer } from "../../src/modules/fleet/application/services/fleet-command-sanitizer";

export class MockSshClient implements SshClientPort {
  public executedCommands: string[] = [];
  public jlistResponse = JSON.stringify([
    {
      pid: 1001,
      name: "portal-api",
      pm_id: 0,
      monit: { cpu: 1.5, memory: 104857600 },
      pm2_env: { status: "online", restart_time: 2, pm_uptime: Date.now() - 3600000 },
    },
    {
      pid: 1002,
      name: "background-worker",
      pm_id: 1,
      monit: { cpu: 0.2, memory: 52428800 },
      pm2_env: { status: "online", restart_time: 0, pm_uptime: Date.now() - 3600000 },
    },
  ]);

  public async execute(
    server: ServerConnectionConfig,
    command: string
  ): Promise<SshCommandResult> {
    FleetCommandSanitizer.assertAllowlisted(command);
    this.executedCommands.push(command);

    if (command === "pm2 jlist") {
      return { stdout: this.jlistResponse, stderr: "", code: 0 };
    }
    if (command.startsWith("pm2 restart")) {
      return { stdout: `[PM2] Process restarted successfully`, stderr: "", code: 0 };
    }
    if (command.startsWith("pm2 logs")) {
      return { stdout: `[2026-10-10] Server listening on port 3000\n[2026-10-10] Ready for connections`, stderr: "", code: 0 };
    }
    if (command.includes("/proc/loadavg") || command.includes("/proc/meminfo")) {
      return {
        stdout: `0.18 0.22 0.25 1/180 1234
MemTotal:        8192000 kB
MemFree:         4096000 kB
MemAvailable:    6144000 kB
Buffers:          256000 kB
Cached:          1792000 kB
SwapTotal:       2048000 kB
SwapFree:        1900000 kB
123456.78 987654.32
PRETTY_NAME="Ubuntu 24.04.1 LTS"
Filesystem     1K-blocks     Used Available Use% Mounted on
/dev/root       50000000 18000000  32000000  36% /
6.8.0-1017-oracle x86_64
4`,
        stderr: "",
        code: 0,
      };
    }

    return { stdout: "", stderr: "Unknown command", code: 127 };
  }

  public async disconnect(serverId: string): Promise<void> {}
  public async disconnectAll(): Promise<void> {}
}
