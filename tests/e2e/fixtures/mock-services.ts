/**
 * Mock Network Services: In-memory Mail Sink, Toggleable Uptime HTTP Server, BadSSL simulator, RDAP
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export interface SentMailRecord {
  to: string | string[];
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
  sentAt: number;
}

export class MockMailSink {
  private sentMails: SentMailRecord[] = [];

  sendMail(mail: Omit<SentMailRecord, 'sentAt'>): void {
    this.sentMails.push({
      ...mail,
      sentAt: Date.now()
    });
  }

  getMails(): SentMailRecord[] {
    return [...this.sentMails];
  }

  getMailsFor(recipient: string): SentMailRecord[] {
    return this.sentMails.filter((m) => {
      if (Array.isArray(m.to)) return m.to.includes(recipient);
      return m.to === recipient;
    });
  }

  clear(): void {
    this.sentMails = [];
  }
}

export class MockUptimeHttpServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private isHealthy: boolean = true;
  public requestCount: number = 0;

  setHealthy(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.requestCount++;
        if (this.isHealthy) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        }
      });
    });
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}/health`;
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
}

export class MockRdapServer {
  private server: http.Server | null = null;
  private port: number = 0;

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
        // Emulate RDAP JSON format with registration and expiration dates
        const rdapResponse = {
          objectClassName: 'domain',
          handle: 'EXAMPLE-DOM',
          ldhName: 'example.com',
          events: [
            { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
            { eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' },
            { eventAction: 'last changed', eventDate: '2025-01-01T00:00:00Z' }
          ],
          entities: [
            {
              roles: ['registrar'],
              vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar Inc.']]]
            }
          ]
        };
        res.end(JSON.stringify(rdapResponse));
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        }
      });
    });
  }

  getUrl(domain: string = 'example.com'): string {
    return `http://127.0.0.1:${this.port}/domain/${domain}`;
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
}
