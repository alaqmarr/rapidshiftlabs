/**
 * Local RFC 4254 Mock SSH2 Server emulating PM2 and Linux telemetry
 * Meets Acceptance Criteria: Emulated PM2 (pm2 jlist, pm2 restart <id>, pm2 logs <id> --nostream --lines N, system metrics)
 */

import { Server, type Connection, type ServerChannel } from 'ssh2';
import crypto from 'node:crypto';

export interface MockPm2Process {
  pm2_id: number;
  name: string;
  pid: number;
  pm2_env: {
    status: 'online' | 'stopped' | 'errored';
    restart_time: number;
    pm_uptime: number;
    created_at: number;
    node_version: string;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

export class MockSshPm2Server {
  private server: Server | null = null;
  private port: number = 0;
  private hostKeys: string[];
  public processes: Map<number, MockPm2Process> = new Map();
  public executedCommands: string[] = [];
  public restartCounts: Map<number, number> = new Map();

  constructor() {
    // Generate a temporary 2048-bit RSA key for host authentication
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
    });
    this.hostKeys = [privateKey];

    // Seed default emulated processes
    this.addProcess(0, 'rapidshift-api', 1234, 'online', 2);
    this.addProcess(1, 'rapidshift-worker', 1235, 'online', 1);
    this.addProcess(2, 'client-web-prod', 2468, 'online', 0);
  }

  addProcess(id: number, name: string, pid: number, status: 'online' | 'stopped' | 'errored', restarts: number = 0): void {
    this.processes.set(id, {
      pm2_id: id,
      name,
      pid,
      pm2_env: {
        status,
        restart_time: restarts,
        pm_uptime: Date.now() - 3600000,
        created_at: Date.now() - 7200000,
        node_version: 'v22.13.1'
      },
      monit: {
        memory: 104857600, // ~100MB
        cpu: 1.5
      }
    });
    this.restartCounts.set(id, restarts);
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = new Server({ hostKeys: this.hostKeys }, (client: Connection) => {
        client.on('authentication', (ctx) => {
          // Accept user 'ubuntu' with public key or password for testing
          if (ctx.username === 'ubuntu') {
            ctx.accept();
          } else {
            ctx.reject(['publickey', 'password']);
          }
        });

        client.on('ready', () => {
          client.on('session', (acceptSession) => {
            const session = acceptSession();
            session.on('exec', (acceptExec, rejectExec, info) => {
              const stream = acceptExec();
              this.handleExec(info.command, stream);
            });
          });
        });

        client.on('error', () => {
          // Ignore client connection errors during tests
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to obtain server port'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  private handleExec(command: string, stream: ServerChannel): void {
    this.executedCommands.push(command);
    const trimmed = command.trim();

    // 1. Emulate `pm2 jlist`
    if (trimmed === 'pm2 jlist') {
      const list = Array.from(this.processes.values());
      stream.stdout.write(JSON.stringify(list));
      stream.exit(0);
      stream.end();
      return;
    }

    // 2. Emulate `pm2 restart <id>`
    const restartMatch = trimmed.match(/^pm2 restart (\d+)$/);
    if (restartMatch) {
      const id = parseInt(restartMatch[1], 10);
      const proc = this.processes.get(id);
      if (proc) {
        proc.pm2_env.restart_time += 1;
        this.restartCounts.set(id, (this.restartCounts.get(id) || 0) + 1);
        stream.stdout.write(`[PM2] Process ${id} successfully restarted\n`);
        stream.exit(0);
      } else {
        stream.stderr.write(`[PM2][ERROR] Process ${id} not found\n`);
        stream.exit(1);
      }
      stream.end();
      return;
    }

    // 3. Emulate `pm2 logs <id> --nostream --lines <n>`
    const logsMatch = trimmed.match(/^pm2 logs (\d+) --nostream --lines (\d+)$/);
    if (logsMatch) {
      const id = parseInt(logsMatch[1], 10);
      const lines = parseInt(logsMatch[2], 10);
      const proc = this.processes.get(id);
      if (proc) {
        let output = '';
        for (let i = 1; i <= Math.min(lines, 10); i++) {
          output += `[PM2][${proc.name}][${i}] Application online and serving requests.\n`;
        }
        stream.stdout.write(output);
        stream.exit(0);
      } else {
        stream.stderr.write(`[PM2][ERROR] Process ${id} not found\n`);
        stream.exit(1);
      }
      stream.end();
      return;
    }

    // 4. Emulate combined metrics probe
    if (trimmed.includes('/proc/loadavg') || trimmed.includes('/proc/meminfo')) {
      const telemetry = [
        '---LOADAVG---',
        '0.15 0.20 0.18 1/240 12345',
        '---MEMINFO---',
        'MemTotal:        4096000 kB',
        'MemFree:         2048000 kB',
        'MemAvailable:    2560000 kB',
        '---UPTIME---',
        '86400.50 172800.20',
        '---END---'
      ].join('\n');
      stream.stdout.write(telemetry);
      stream.exit(0);
      stream.end();
      return;
    }

    // 5. Injection rejection or unknown command
    stream.stderr.write(`bash: command not found or command injection blocked: ${command}\n`);
    stream.exit(127);
    stream.end();
  }
}
