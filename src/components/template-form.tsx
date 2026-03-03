"use client";

import { useState, useEffect } from "react";

export interface TemplateFormData {
  name: string;
  description: string;
  promptTemplate: string;
}

interface TemplateFormProps {
  initialData?: TemplateFormData;
  onSubmit: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const VARIABLES = [
  { name: "{{transcript}}", desc: "Full transcript text" },
  { name: "{{speakers}}", desc: "Comma-separated speaker names" },
  { name: "{{duration}}", desc: "Recording duration" },
  { name: "{{date}}", desc: "Recording date" },
  { name: "{{topic}}", desc: "Original filename / topic" },
];

export default function TemplateForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Create Template",
}: TemplateFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [promptTemplate, setPromptTemplate] = useState(
    initialData?.promptTemplate || ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description);
      setPromptTemplate(initialData.promptTemplate);
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !promptTemplate.trim()) {
      setError("Name and prompt template are required");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name, description, promptTemplate });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSubmitting(false);
    }
  };

  const insertVariable = (varName: string) => {
    setPromptTemplate((prev) => prev + varName);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Template Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Meeting Summary"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this template produces"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Prompt Template
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {VARIABLES.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertVariable(v.name)}
              className="px-2 py-1 bg-surface border border-border rounded text-xs text-muted hover:text-accent hover:border-accent/30 transition-colors"
              title={v.desc}
            >
              {v.name}
            </button>
          ))}
        </div>
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          placeholder="Enter your prompt template. Use variables like {{transcript}} to inject data."
          rows={8}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors font-mono text-sm resize-y"
          required
        />
        <p className="text-muted text-xs mt-1">
          Available variables: {VARIABLES.map((v) => v.name).join(", ")}
        </p>
      </div>

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
