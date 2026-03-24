"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { getSettings, updateSettings, type AgentSettings } from "@/lib/research-api";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "compatible", label: "Compatible" },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [form, setForm] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      getSettings()
        .then(setForm)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await updateSettings(form);
      setForm(updated);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Agent Settings</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}. Make sure the API server is running on port 8000.
          </div>
        ) : form ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">LLM Provider</label>
                <select
                  value={form.llmProvider}
                  onChange={(e) => set("llmProvider", e.target.value)}
                  className={inputClass}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Model</label>
                <input value={form.llmModel} onChange={(e) => set("llmModel", e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Temperature ({form.llmTemperature})
              </label>
              <input
                type="range" min="0" max="1" step="0.1"
                value={form.llmTemperature}
                onChange={(e) => set("llmTemperature", parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {([
                ["maxSearchIterations", "Max Search Iterations"],
                ["maxRevisions", "Max Revisions"],
                ["searchResultsPerQuery", "Results Per Query"],
                ["maxConcurrentSearches", "Max Concurrent Searches"],
                ["minCitations", "Min Citations"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  <input
                    type="number" min="1"
                    value={form[key]}
                    onChange={(e) => set(key, parseInt(e.target.value) || 1)}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {([
                ["relevanceThreshold", "Relevance Threshold (0-10)"],
                ["qualityThreshold", "Quality Threshold (0-10)"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  <input
                    type="number" min="0" max="10" step="0.5"
                    value={form[key]}
                    onChange={(e) => set(key, parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
