/**
 * SSE stream formatting helpers for Next.js route handlers.
 */

import type { SSEEventType } from "../types";

/** Format a single SSE event string. */
export function formatSSE(event: SSEEventType, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Create a Response object that streams SSE events.
 * The handler receives an `enqueue` function to emit events.
 */
export function createSSEStream(
  handler: (
    enqueue: (event: SSEEventType, data: unknown) => void
  ) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SSEEventType, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };
      try {
        await handler(enqueue);
      } catch (err) {
        enqueue("error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
