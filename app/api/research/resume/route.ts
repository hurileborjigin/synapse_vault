/**
 * POST /api/research/resume — Resume pipeline after human-in-the-loop approval.
 * Accepts threadId + approved sub-questions, returns new SSE stream.
 */

import { NextRequest } from "next/server";
import { resumeResearch } from "@/src/lib/synapse/runner";
import { createSSEStream } from "@/src/lib/synapse/utils/sse";
import { saveResult } from "../../results/persistence";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const threadId = body.threadId as string;
  const approval = body.approval as Record<string, unknown>;

  if (!threadId) {
    return Response.json({ error: "threadId is required" }, { status: 400 });
  }
  if (!approval) {
    return Response.json({ error: "approval is required" }, { status: 400 });
  }

  return createSSEStream(async (enqueue) => {
    const latestState = await resumeResearch(threadId, approval, {
      onEvent: (event, data) => enqueue(event, data),
    });

    // Persist result
    try {
      await saveResult(latestState);
    } catch {
      // Non-fatal
    }
  });
}
