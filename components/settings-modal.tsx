"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
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

// Map provider to its API key field
const PROVIDER_KEY_MAP: Record<string, keyof AgentSettings> = {
  anthropic: "anthropicApiKey",
  openai: "openaiApiKey",
  azure_openai: "azureOpenaiApiKey",
  compatible: "compatibleApiKey",
};

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2 text-sm font-semibold text-foreground py-1">
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      {title}
    </button>
  );
}

function KeyInput({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const hasValue = value && !value.split("").every((c) => c === "*");
  const isMasked = value.includes("*");
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasValue ? "(saved)" : "Not set"}
          className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {isMasked && (
        <p className="text-[10px] text-muted-foreground mt-0.5">Clear and re-enter to change</p>
      )}
    </div>
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [form, setForm] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState({ provider: true, search: false, workflow: false });
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

  const toggleSection = (s: keyof typeof sectionsOpen) =>
    setSectionsOpen((prev) => ({ ...prev, [s]: !prev[s] }));

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  const providerKeyField = form ? PROVIDER_KEY_MAP[form.llmProvider] : null;
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
          <div className="space-y-5">
            {/* ── LLM Provider Section ── */}
            <div className="space-y-3">
              <SectionHeader title="LLM Provider" open={sectionsOpen.provider} onToggle={() => toggleSection("provider")} />
              {sectionsOpen.provider && (
                <div className="space-y-3 pl-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Provider</label>
                      <select value={form.llmProvider} onChange={(e) => set("llmProvider", e.target.value)} className={inputClass}>
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

                  {/* Provider API Key */}
                  {providerKeyField && (
                    <KeyInput
                      label={`${PROVIDERS.find((p) => p.value === form.llmProvider)?.label ?? "Provider"} API Key`}
                      value={form[providerKeyField] as string}
                      onChange={(v) => set(providerKeyField, v)}
                    />
                  )}

                  {/* Azure-specific fields */}
                  {form.llmProvider === "azure_openai" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Azure Endpoint</label>
                        <input
                          value={form.azureOpenaiEndpoint}
                          onChange={(e) => set("azureOpenaiEndpoint", e.target.value)}
                          placeholder="https://your-resource.openai.azure.com"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">API Version</label>
                        <input
                          value={form.azureOpenaiApiVersion}
                          onChange={(e) => set("azureOpenaiApiVersion", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}

                  {/* Compatible-specific fields */}
                  {form.llmProvider === "compatible" && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL</label>
                      <input
                        value={form.compatibleBaseUrl}
                        onChange={(e) => set("compatibleBaseUrl", e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className={inputClass}
                      />
                    </div>
                  )}

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
                </div>
              )}
            </div>
            {/* ── Search API Keys Section ── */}
            <div className="space-y-3">
              <SectionHeader title="Search API Keys" open={sectionsOpen.search} onToggle={() => toggleSection("search")} />
              {sectionsOpen.search && (
                <div className="space-y-3 pl-5">
                  <KeyInput label="Jina API Key" value={form.jinaApiKey} onChange={(v) => set("jinaApiKey", v)} />
                  <KeyInput label="Brave API Key" value={form.braveApiKey} onChange={(v) => set("braveApiKey", v)} />
                  <KeyInput label="Tavily API Key" value={form.tavilyApiKey} onChange={(v) => set("tavilyApiKey", v)} />
                </div>
              )}
            </div>

            {/* ── Workflow Parameters Section ── */}
            <div className="space-y-3">
              <SectionHeader title="Workflow Parameters" open={sectionsOpen.workflow} onToggle={() => toggleSection("workflow")} />
              {sectionsOpen.workflow && (
                <div className="space-y-3 pl-5">
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
                </div>
              )}
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
