import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGate, RapidShiftClient } from "../../../../sdk/src/index";

describe("SDK Gate & Client Unit Tests", () => {
  const secretKey = "rsk_live_testkey12345678901234567890";
  const mockBaseUrl = "http://localhost:3000";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Access Allowed Flow", () => {
    it("returns allowed result when RapidShift responds with allowed: true", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            allowed: true,
            state: "active",
            rapidshiftStatus: "online",
            token: "mock.jwt.token",
            client: { id: "cli_test_1" },
          },
        }),
      });

      const gate = createGate({
        secretKey,
        baseUrl: mockBaseUrl,
        fetch: mockFetch,
      });

      const req = new Request("http://localhost:3000/dashboard");
      const result: any = await gate(req);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.allowed).toBe(true);
      expect(result.state).toBe("active");
      expect(result.rapidshiftStatus).toBe("online");
    });
  });

  describe("2. Access Blocked Flow", () => {
    it("redirects to /payment-due when access is blocked due to dues", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            allowed: false,
            state: "blocked",
            rapidshiftStatus: "online",
            token: "mock.jwt.blocked",
            client: { id: "cli_test_1" },
          },
        }),
      });

      const gate = createGate({
        secretKey,
        baseUrl: mockBaseUrl,
        blockedPage: "/payment-due",
        fetch: mockFetch,
      });

      const req = new Request("http://localhost:3000/dashboard");
      const res: any = await gate(req);

      expect(res.allowed).toBe(false);
      expect(res.status).toBe(307);
      expect(res.headers?.get("location")).toContain("/payment-due");
    });
  });

  describe("3. Excluded Paths Bypass", () => {
    it("bypasses static assets and excluded paths without calling network", async () => {
      const mockFetch = vi.fn();

      const gate = createGate({
        secretKey,
        baseUrl: mockBaseUrl,
        exclude: ["/api/health", "/public"],
        fetch: mockFetch,
      });

      const paths = [
        "/_next/static/chunks/main.js",
        "/favicon.ico",
        "/payment-due",
        "/api/health",
        "/public/about",
      ];

      for (const path of paths) {
        const req = new Request(`http://localhost:3000${path}`);
        const result: any = await gate(req);
        expect(result.allowed).toBe(true);
        expect(result.state).toBe("excluded");
      }

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("4. In-Memory Caching", () => {
    it("caches access status in memory and does not hit network repeatedly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            allowed: true,
            state: "active",
            rapidshiftStatus: "online",
            client: { id: "cli_test_1" },
          },
        }),
      });

      const client = new RapidShiftClient({
        secretKey,
        baseUrl: mockBaseUrl,
        cacheTtlSeconds: 60,
        fetch: mockFetch,
      });

      // Call 1 -> Network hit
      const first = await client.getAccessStatus();
      expect(first.allowed).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call 2 -> In-memory cache hit
      const second = await client.getAccessStatus();
      expect(second.allowed).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1

      // Call 3 with bypassCache -> Network hit
      const third = await client.getAccessStatus({ bypassCache: true });
      expect(third.allowed).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("5. Fail-Open Resilience", () => {
    it("fails open (allowed: true) when RapidShift API throws a network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));

      const gate = createGate({
        secretKey,
        baseUrl: mockBaseUrl,
        failMode: "open",
        fetch: mockFetch,
      });

      const req = new Request("http://localhost:3000/dashboard");
      const result: any = await gate(req);

      expect(result.allowed).toBe(true);
      expect(result.rapidshiftStatus).toBe("offline");
      expect(result.error).toContain("Network connection refused");
    });

    it("fails open (allowed: true) when RapidShift API times out", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 100))
      );

      const client = new RapidShiftClient({
        secretKey,
        baseUrl: mockBaseUrl,
        timeoutMs: 50,
        failMode: "open",
        fetch: mockFetch,
      });

      const status = await client.getAccessStatus();

      expect(status.allowed).toBe(true);
      expect(status.rapidshiftStatus).toBe("offline");
    });

    it("fails closed (allowed: false) when failMode is 'closed' and network fails", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection reset by peer"));

      const client = new RapidShiftClient({
        secretKey,
        baseUrl: mockBaseUrl,
        failMode: "closed",
        fetch: mockFetch,
      });

      const status = await client.getAccessStatus();

      expect(status.allowed).toBe(false);
      expect(status.rapidshiftStatus).toBe("offline");
      expect(status.error).toContain("Connection reset by peer");
    });
  });
});
