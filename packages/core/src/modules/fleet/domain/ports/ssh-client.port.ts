export interface SshCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ServerConnectionConfig {
  serverId: string;
  host: string;
  port: number;
  username: string;
  decryptedPrivateKey: string;
  decryptedPassphrase?: string | null;
  hostFingerprint?: string | null;
}

export interface SshClientPort {
  execute(
    server: ServerConnectionConfig,
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<SshCommandResult>;
  disconnect(serverId: string): Promise<void>;
  disconnectAll(): Promise<void>;
}
