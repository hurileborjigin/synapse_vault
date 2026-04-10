"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  Check,
  ExternalLink,
  Send,
} from "lucide-react";
import type { TopicProposal } from "@/lib/research-api";
import type { SubQuestion } from "@/lib/sample-data";

interface TopicApprovalPanelProps {
  proposal: TopicProposal;
  onApprove: (approved: SubQuestion[]) => void;
  onCancel: () => void;
}

function EvidenceCard({
  results,
}: {
  results: Array<{ title: string; snippet: string; url: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (results.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>
          {results.length} source{results.length !== 1 ? "s" : ""} found
        </span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 ml-4">
          {results.map((r, i) => (
            <div
              key={i}
              className="rounded border border-border/50 bg-background/50 px-2.5 py-2 text-[11px]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-foreground/90 leading-tight line-clamp-1">
                  {r.title}
                </span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="mt-0.5 text-muted-foreground/70 leading-relaxed line-clamp-2">
                {r.snippet}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopicApprovalPanel({
  proposal,
  onApprove,
  onCancel,
}: TopicApprovalPanelProps) {
  // Checklist state: track which topics are selected
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(proposal.subQuestions.map((_, i) => i))
  );
  // Custom topics added by user
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  const toggleTopic = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const addCustomTopic = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomTopics((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCustomTopic = (idx: number) => {
    setCustomTopics((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleApprove = () => {
    // Collect selected proposed topics
    const approved: SubQuestion[] = proposal.subQuestions
      .filter((_, i) => selected.has(i))
      .map((q) => ({ ...q }));

    // Add custom topics
    for (const topic of customTopics) {
      approved.push({
        question: topic,
        priority: 2,
        answered: false,
        searchQueries: [topic],
      });
    }

    if (approved.length === 0) return;
    onApprove(approved);
  };

  // Map light search results to questions
  const getEvidenceForQuestion = (question: string) => {
    const match = proposal.lightSearchResults.find(
      (lr) =>
        lr.query === question ||
        question.toLowerCase().includes(lr.query.toLowerCase().slice(0, 20))
    );
    return match?.topResults ?? [];
  };

  const selectedCount =
    selected.size + customTopics.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-1">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-400/10">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Select research topics
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Check the topics you want to research, add your own below
          </p>
        </div>
      </div>

      {/* Proposed topics checklist */}
      <div className="space-y-1.5">
        {proposal.subQuestions.map((q, idx) => {
          const isChecked = selected.has(idx);
          const evidence = getEvidenceForQuestion(q.question);

          return (
            <div key={idx} className="group">
              <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/30 hover:border-border px-3 py-2.5 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleTopic(idx)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold tracking-wider uppercase rounded px-1 py-0.5 border ${
                        q.priority === 1
                          ? "text-red-400 bg-red-400/10 border-red-400/20"
                          : q.priority === 2
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                            : "text-muted-foreground bg-muted border-border"
                      }`}
                    >
                      P{q.priority}
                    </span>
                    <span
                      className={`text-sm leading-snug ${isChecked ? "text-foreground" : "text-muted-foreground line-through"}`}
                    >
                      {q.question}
                    </span>
                  </div>

                  <EvidenceCard results={evidence} />
                </div>
              </label>
            </div>
          );
        })}
      </div>

      {/* Custom topics */}
      {customTopics.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Your topics
          </p>
          {customTopics.map((topic, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5"
            >
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">{topic}</span>
              <button
                onClick={() => removeCustomTopic(idx)}
                className="text-muted-foreground/40 hover:text-destructive text-xs transition-colors"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add custom topic input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTopic();
              }
            }}
            placeholder="Add your own research topic..."
            className="w-full rounded-lg border border-dashed border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {customInput.trim() && (
          <button
            onClick={addCustomTopic}
            className="rounded-lg bg-muted px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-[11px] text-muted-foreground">
          {selectedCount} topic{selectedCount !== 1 ? "s" : ""} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            <Check className="h-3 w-3" />
            Research {selectedCount} topic{selectedCount !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
