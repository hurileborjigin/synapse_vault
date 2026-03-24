"use client";

import type { QualityScores } from "@/lib/sample-data";

interface QualityScoresDisplayProps {
  scores: QualityScores;
}

const scoreLabels: Record<keyof QualityScores, { label: string; description: string }> = {
  comprehensiveness: {
    label: "Comprehensiveness",
    description: "Information coverage breadth and depth",
  },
  insight: {
    label: "Insight",
    description: "Analysis depth and logical reasoning",
  },
  instruction_following: {
    label: "Task Adherence",
    description: "Response to objectives and requirements",
  },
  readability: {
    label: "Readability",
    description: "Structure, fluency, and presentation",
  },
};

function ScoreBar({ score, label, description }: { score: number; label: string; description: string }) {
  const percentage = (score / 10) * 100;
  const getScoreColor = (score: number) => {
    if (score >= 8) return "bg-emerald-500";
    if (score >= 6) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-mono font-semibold text-foreground">
          {score.toFixed(1)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getScoreColor(score)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function QualityScoresDisplay({ scores }: QualityScoresDisplayProps) {
  const averageScore =
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quality Assessment
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Average</span>
          <span className="rounded-md bg-primary/20 px-2 py-0.5 text-sm font-semibold text-primary">
            {averageScore.toFixed(1)}/10
          </span>
        </div>
      </div>
      <div className="space-y-4">
        {(Object.entries(scores) as [keyof QualityScores, number][]).map(
          ([key, value]) => (
            <ScoreBar
              key={key}
              score={value}
              label={scoreLabels[key].label}
              description={scoreLabels[key].description}
            />
          )
        )}
      </div>
    </div>
  );
}
