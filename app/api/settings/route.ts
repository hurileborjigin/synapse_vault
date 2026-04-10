/**
 * GET /api/settings — returns current settings (with masked API keys).
 * PUT /api/settings — updates settings.
 * Replaces Python's GET/PUT /api/settings endpoints.
 */

import { NextRequest } from "next/server";
import {
  getSettings,
  updateSettings,
  type Settings,
} from "@/src/lib/synapse/config";

export const dynamic = "force-dynamic";

// Fields that should be masked in GET responses
const SENSITIVE_FIELDS: (keyof Settings)[] = [
  "anthropicApiKey",
  "openaiApiKey",
  "azureOpenaiApiKey",
  "compatibleApiKey",
  "jinaApiKey",
  "braveApiKey",
  "tavilyApiKey",
];

function maskKey(value: string): string {
  if (!value || value.length < 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "*".repeat(value.length - 8) + value.slice(-4);
}

function buildSettingsResponse(): Record<string, unknown> {
  const settings = getSettings();
  const data: Record<string, unknown> = { ...settings };

  // Mask sensitive fields
  for (const field of SENSITIVE_FIELDS) {
    const value = data[field];
    if (typeof value === "string") {
      data[field] = maskKey(value);
    }
  }

  // Include search API availability status
  data.searchApiStatus = {
    jina: !!settings.jinaApiKey,
    brave: !!settings.braveApiKey,
    tavily: !!settings.tavilyApiKey,
  };

  return data;
}

export async function GET() {
  return Response.json(buildSettingsResponse());
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Skip masked key values (user didn't change them)
  for (const field of SENSITIVE_FIELDS) {
    const value = body[field];
    if (typeof value === "string" && value.includes("*")) {
      delete body[field];
    }
  }

  try {
    updateSettings(body as Partial<Settings>);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid settings" },
      { status: 400 }
    );
  }

  return Response.json(buildSettingsResponse());
}
