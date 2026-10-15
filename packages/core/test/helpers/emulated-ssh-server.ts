import { Server as Ssh2Server } from "ssh2";
import { generateKeyPairSync } from "node:crypto";

export class EmulatedSshServer {
  private server: Ssh2Server | null = null;
  public port = 0;
  public privateKey = "";
  public publicKey = "";

  public async start(): Promise<number> {
    const keys = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;

    return new Promise((resolve) => {
      this.server = new Ssh2Server({ hostKeys: [this.privateKey] }, (client) => {
        client.on("error", () => {});
        client.on("authentication", (ctx) => {
          ctx.accept();
        });
        client.on("ready", () => {
          client.on("session", (accept) => {
            const session = accept();
            session.on("exec", (acceptExec, _rejectExec, info) => {
              const stream = acceptExec();
              const cmd = info.command;
              if (cmd === "pm2 jlist") {
                stream.write(
                  JSON.stringify([
                    {
                      pid: 999,
                      name: "test-app",
                      pm_id: 0,
                      monit: { cpu: 1, memory: 50000 },
                      pm2_env: { status: "online", restart_time: 1 },
                    },
                  ])
                );
                stream.exit(0);
              } else if (cmd.startsWith("pm2 restart")) {
                stream.write("[PM2] Process restarted\n");
                stream.exit(0);
              } else if (cmd.startsWith("pm2 logs")) {
                stream.write("Log line 1\nLog line 2\n");
                stream.exit(0);
              } else {
                stream.stderr.write(`Command rejected: ${cmd}\n`);
                stream.exit(127);
              }
              stream.end();
            });
          });
        });
      });

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
