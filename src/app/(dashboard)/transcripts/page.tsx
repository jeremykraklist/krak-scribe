"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";
import LoadingSpinner from "@/components/loading-spinner";
import EmptyState from "@/components/empty-state";
import ErrorState from "@/components/error-state";
import StatusBadge from "@/components/status-badge";

interface Transcript {
  id: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  duration: number | null;
  status: "pending" | "transcribing" | "completed" | "failed";
  language: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  textPreview: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function TranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTranscripts = useCallback(async () => {
    try {
      const url = debouncedSearch
        ? `/api/transcripts?search=${encodeURIComponent(debouncedSearch)}`
        : "/api/transcripts";
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to load transcripts");
      const data = await res.json();
      setTranscripts(data.transcripts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchTranscripts();
  }, [fetchTranscripts]);

  if (loading) return <LoadingSpinner text="Loading transcripts..." />;
  if (error) return <ErrorState message={error} onRetry={fetchTranscripts} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transcripts</h1>
          <p className="text-muted text-sm mt-1">
            {transcripts.length} transcript{transcripts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/upload"
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
          Upload New
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcripts by filename or content..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* List */}
      {transcripts.length === 0 ? (
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
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          }
          title={debouncedSearch ? "No results found" : "No transcripts yet"}
          description={
            debouncedSearch
              ? "Try a different search term"
              : "Upload your first audio file to get started"
          }
          actionLabel={debouncedSearch ? undefined : "Upload Audio"}
          actionHref={debouncedSearch ? undefined : "/upload"}
        />
      ) : (
        <div className="bg-surface border border-border rounded-xl divide-y divide-border">
          {transcripts.map((t) => (
            <Link
              key={t.id}
              href={`/transcripts/${t.id}`}
              className="flex items-center gap-4 p-4 hover:bg-surface-hover transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate text-sm">
                    {t.originalFilename}
                  </p>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex items-center gap-3 text-muted text-xs mt-1">
                  <span>
                    {new Date(t.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span>•</span>
                  <span>{formatDuration(t.duration)}</span>
                  <span>•</span>
                  <span>{formatFileSize(t.fileSize)}</span>
                  {t.language && (
                    <>
                      <span>•</span>
                      <span className="uppercase">{t.language}</span>
                    </>
                  )}
                </div>
                {t.textPreview && (
                  <p className="text-muted text-xs mt-1 truncate">
                    {t.textPreview}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <svg
                className="w-5 h-5 text-muted flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
