import type { ResearchResult } from "./sample-data";

export interface SavedSession {
  id: string;
  query: string;
  timestamp: number;
  result: ResearchResult;
}

const STORAGE_KEY = "synapse-vault-sessions";

function getLocalSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSession[];
  } catch {
    return [];
  }
}

function setLocalSessions(sessions: SavedSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export async function getSessions(): Promise<SavedSession[]> {
  const localSessions = getLocalSessions();

  try {
    const res = await fetch("/api/results", { cache: "no-store" });
    if (!res.ok) return localSessions;

    const fileSessions = (await res.json()) as SavedSession[];
    const deduped = new Map<string, SavedSession>();
    [...fileSessions, ...localSessions].forEach((session) => {
      deduped.set(session.id, session);
    });

    return [...deduped.values()].sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return localSessions;
  }
}

export function saveSession(result: ResearchResult): SavedSession {
  const session: SavedSession = {
    id: crypto.randomUUID(),
    query: result.query,
    timestamp: Date.now(),
    result,
  };
  setLocalSessions([session, ...getLocalSessions()]);
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  setLocalSessions(getLocalSessions().filter((s) => s.id !== id));

  if (id.endsWith(".md")) {
    try {
      await fetch(`/api/results/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }
}

export async function clearSessions(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  try {
    await fetch("/api/results", { method: "DELETE" });
  } catch {
    // ignore
  }
}
