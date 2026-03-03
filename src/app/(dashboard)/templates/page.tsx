"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-client";
import LoadingSpinner from "@/components/loading-spinner";
import EmptyState from "@/components/empty-state";
import ErrorState from "@/components/error-state";
import TemplateForm, { type TemplateFormData } from "@/components/template-form";

interface Template {
  id: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await authFetch("/api/templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async (data: TemplateFormData) => {
    const res = await authFetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to create template");
    }

    setShowForm(false);
    await fetchTemplates();
  };

  const handleUpdate = async (data: TemplateFormData) => {
    if (!editingTemplate) return;

    const res = await authFetch(`/api/templates/${editingTemplate.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to update template");
    }

    setEditingTemplate(null);
    await fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;

    const res = await authFetch(`/api/templates/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      alert("Failed to delete template");
      return;
    }

    await fetchTemplates();
  };

  const handleSetDefault = async (id: string) => {
    const res = await authFetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });

    if (res.ok) {
      await fetchTemplates();
    }
  };

  if (loading) return <LoadingSpinner text="Loading templates..." />;
  if (error) return <ErrorState message={error} onRetry={fetchTemplates} />;

  // Show form views
  if (showForm) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Create Template</h1>
        <div className="bg-surface border border-border rounded-xl p-6">
          <TemplateForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitLabel="Create Template"
          />
        </div>
      </div>
    );
  }

  if (editingTemplate) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Edit Template</h1>
        <div className="bg-surface border border-border rounded-xl p-6">
          <TemplateForm
            initialData={{
              name: editingTemplate.name,
              description: editingTemplate.description || "",
              promptTemplate: editingTemplate.promptTemplate,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTemplate(null)}
            submitLabel="Save Changes"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-muted text-sm mt-1">
            AI prompt templates for processing transcripts
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 self-start"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Template
        </button>
      </div>

      {/* Variables reference */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-medium mb-2">Available Variables</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "{{transcript}}", desc: "Full transcript text" },
            { name: "{{speakers}}", desc: "Speaker names" },
            { name: "{{duration}}", desc: "Recording duration" },
            { name: "{{date}}", desc: "Recording date" },
            { name: "{{topic}}", desc: "Filename / topic" },
          ].map((v) => (
            <span
              key={v.name}
              className="px-2 py-1 bg-background border border-border rounded text-xs text-muted"
              title={v.desc}
            >
              {v.name}
            </span>
          ))}
        </div>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="w-8 h-8 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          }
          title="No templates yet"
          description="Create your first AI template to process transcripts into summaries, action items, and more."
          actionLabel="Create Template"
          actionHref="#"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-surface border border-border rounded-xl p-5 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    {t.isDefault && (
                      <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-muted text-sm mt-1">{t.description}</p>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-background border border-border rounded-lg p-3 mb-4">
                <p className="text-xs text-muted font-mono line-clamp-3">
                  {t.promptTemplate}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingTemplate(t)}
                  className="px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-xs hover:border-accent/30 transition-colors"
                >
                  Edit
                </button>
                {!t.isDefault && (
                  <button
                    onClick={() => handleSetDefault(t.id)}
                    className="px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-xs hover:border-accent/30 transition-colors"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => handleDelete(t.id)}
                  className="px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-xs text-red-400 hover:border-red-500/30 transition-colors ml-auto"
                >
                  Delete
                </button>
              </div>

              <p className="text-muted text-xs mt-3">
                Created{" "}
                {new Date(t.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
