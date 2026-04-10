/**
 * POST /api/research — SSE streaming research pipeline.
 * Replaces Python's POST /api/research endpoint.
 */

import { NextRequest } from "next/server";
import { runResearch } from "@/src/lib/synapse/runner";
import { createSSEStream } from "@/src/lib/synapse/utils/sse";
import { saveResult } from "../results/persistence";

export const maxDuration = 300; // 5-minute max (Vercel serverless limit)
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query as string)?.trim();
  const language = (body.language as string) || "en";

  if (!query) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  return createSSEStream(async (enqueue) => {
    const latestState = await runResearch(query, language, {
      onEvent: (event, data) => enqueue(event, data),
    });

    // Persist result as Markdown
    try {
      await saveResult(latestState);
    } catch {
      // Non-fatal: don't break the SSE stream for persistence failures
    }
  });
}
