"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  initialQuery?: string;
}

export function QueryInput({ onSubmit, isLoading = false, initialQuery = "" }: QueryInputProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSubmit(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your research question..."
          disabled={isLoading}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-card px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-xs">Cmd</kbd> + <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-xs">Enter</kbd> to submit
      </p>
    </form>
  );
}
