"use client";

import { Trash2, Clock, X } from "lucide-react";
import type { SavedSession } from "@/lib/session-history";

interface SessionHistoryPanelProps {
  sessions: SavedSession[];
  onLoad: (session: SavedSession) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SessionHistoryPanel({ sessions, onLoad, onDelete, onClearAll, onClose }: SessionHistoryPanelProps) {
  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">History</span>
          <span className="text-xs text-muted-foreground">({sessions.length})</span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No research sessions yet
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="group flex items-start gap-3 border-b border-border px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onLoad(session)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{session.query}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(session.timestamp)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={onClearAll}
            className="w-full rounded-md py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
