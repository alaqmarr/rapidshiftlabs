import { Client, type ConnectConfig } from "ssh2";
import type {
  SshClientPort,
  ServerConnectionConfig,
  SshCommandResult,
} from "../../domain/ports/ssh-client.port";
import { FleetCommandSanitizer } from "../../application/services/fleet-command-sanitizer";
import { ExternalServiceError } from "../../../../shared/kernel/errors";

interface PooledConnection {
  client: Client;
  lastUsedAt: number;
  inFlight: number;
}

export class NodeSsh2Adapter implements SshClientPort {
  private readonly pool = new Map<string, PooledConnection>();

  public async execute(
    server: ServerConnectionConfig,
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<SshCommandResult> {
    // Defense-in-depth: assert command is allowlisted before network execution
    FleetCommandSanitizer.assertAllowlisted(command);

    const client = await this.getConnection(server);
    const pooled = this.pool.get(server.serverId);
    if (pooled) pooled.inFlight += 1;

    const timeout = options?.timeoutMs ?? 15_000;

    return new Promise<SshCommandResult>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        if (pooled) pooled.inFlight = Math.max(0, pooled.inFlight - 1);
        reject(
          new ExternalServiceError("SSH", `Command timed out after ${timeout}ms: ${command}`)
        );
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          if (timer) clearTimeout(timer);
          if (pooled) pooled.inFlight = Math.max(0, pooled.inFlight - 1);
          return reject(new ExternalServiceError("SSH", `Failed to exec: ${err.message}`));
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString("utf8");
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString("utf8");
        });

        stream.on("close", (code: number) => {
          if (timer) clearTimeout(timer);
          if (pooled) {
            pooled.inFlight = Math.max(0, pooled.inFlight - 1);
            pooled.lastUsedAt = Date.now();
          }

          if (code !== 0) {
            return reject(
              new ExternalServiceError(
                "SSH",
                `Command failed with exit code ${code}: ${stderr || stdout}`
              )
            );
          }

          resolve({ stdout, stderr, code });
        });
      });
    });
  }

  private async getConnection(server: ServerConnectionConfig): Promise<Client> {
    const existing = this.pool.get(server.serverId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }

    return new Promise<Client>((resolve, reject) => {
      const client = new Client();
      let connected = false;

      const connectConfig: ConnectConfig = {
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: server.decryptedPrivateKey,
        passphrase: server.decryptedPassphrase || undefined,
        readyTimeout: 10_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
        hostHash: "sha256",
        hostVerifier: (hashedKey: string) => {
          if (!server.hostFingerprint) return true;
          const cleanExpected = server.hostFingerprint.replace(/^SHA256:/i, "").toLowerCase();
          const cleanActual = hashedKey.toLowerCase();
          return cleanActual === cleanExpected;
        },
      };

      client.on("ready", () => {
        connected = true;
        this.pool.set(server.serverId, {
          client,
          lastUsedAt: Date.now(),
          inFlight: 0,
        });
        resolve(client);
      });

      client.on("error", (err) => {
        this.pool.delete(server.serverId);
        if (!connected) {
          reject(new ExternalServiceError("SSH", `Connection failed: ${err.message}`));
        }
      });

      client.on("close", () => {
        this.pool.delete(server.serverId);
      });

      client.on("end", () => {
        this.pool.delete(server.serverId);
      });

      try {
        client.connect(connectConfig);
      } catch (err: any) {
        reject(new ExternalServiceError("SSH", `Failed to initiate connection: ${err.message}`));
      }
    });
  }

  public async disconnect(serverId: string): Promise<void> {
    const pooled = this.pool.get(serverId);
    if (pooled) {
      pooled.client.end();
      this.pool.delete(serverId);
    }
  }

  public async disconnectAll(): Promise<void> {
    for (const [, pooled] of this.pool.entries()) {
      pooled.client.end();
    }
    this.pool.clear();
  }
}
