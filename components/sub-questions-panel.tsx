"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import type { SubQuestion } from "@/lib/sample-data";

interface SubQuestionsPanelProps {
  questions: SubQuestion[];
}

export function SubQuestionsPanel({ questions }: SubQuestionsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const sortedQuestions = [...questions].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 border-b border-border pb-3"
      >
        <HelpCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sub-Questions
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {questions.filter((q) => q.answered).length}/{questions.length} answered
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          {sortedQuestions.map((question, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                question.answered
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border bg-card/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                      question.priority === 1
                        ? "bg-primary/20 text-primary"
                        : question.priority === 2
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    P{question.priority}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{question.question}</p>
                  {question.searchQueries.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {question.searchQueries.slice(0, 2).map((query, j) => (
                        <span
                          key={j}
                          className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {query}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {question.answered && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
