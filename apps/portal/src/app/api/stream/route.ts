import { type NextRequest } from "next/server";
import { getRealtimeHub, type RealtimeEvent } from "@rsl/core/events";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestedTopics = (
    searchParams.get("topics") ||
    searchParams.get("topic") ||
    "tickets,billing"
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Security filtering: Ensure client portal users cannot subscribe to other tenants' topics
  const isClientUser = session.user.realm === "client";
  const userClientId = session.user.clientId;

  const authorizedTopics = requestedTopics.filter((topic) => {
    if (!isClientUser) return true; // Admin users have access to all topics
    if (topic.startsWith("client:") && topic !== `client:${userClientId}`) return false;
    if (topic.startsWith("billing:") && topic !== `billing:${userClientId}`) return false;
    return true;
  });

  const encoder = new TextEncoder();
  const hub = getRealtimeHub();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial connection ACK
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now(), topics: authorizedTopics })}\n\n`,
        ),
      );

      // 2. Hub Subscriber
      const unsubscribe = hub.subscribe(authorizedTopics, (event: RealtimeEvent) => {
        // Double check tenant isolation
        if (isClientUser && event.clientId && event.clientId !== userClientId) {
          return;
        }

        const payload = {
          ...event,
          data: event.payload,
        };

        // Emit named event for addEventListener and standard message event for es.onmessage
        const sseMessage = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(payload)}\n\nid: ${event.id}\ndata: ${JSON.stringify(payload)}\n\n`;
        try {
          controller.enqueue(encoder.encode(sseMessage));
        } catch {
          // Stream might be closed
        }
      });

      // 3. Heartbeat ping timer (every 15s)
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15_000);

      // 4. Abort / Disconnect handler
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx reverse proxy buffering bypass
    },
  });
}
