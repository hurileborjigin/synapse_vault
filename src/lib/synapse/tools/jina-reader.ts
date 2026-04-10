/**
 * Jina Reader — full-page content fetching as markdown.
 * Port of Python's tools/jina_reader.py
 */

import { getSettings } from "../config";

export async function fetchPageContent(url: string): Promise<string> {
  const { jinaApiKey } = getSettings();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Retain-Images": "none",
  };
  if (jinaApiKey) {
    headers.Authorization = `Bearer ${jinaApiKey}`;
  }

  try {
    const resp = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) return "";
    const data = await resp.json();
    return (data.data?.content ?? "").slice(0, 15_000);
  } catch {
    return "";
  }
}
