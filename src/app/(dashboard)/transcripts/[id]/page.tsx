"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";
import LoadingSpinner from "@/components/loading-spinner";
import ErrorState from "@/components/error-state";
import StatusBadge from "@/components/status-badge";

interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface TranscriptDetail {
  id: string;
  originalFilename: string;
  status: "pending" | "transcribing" | "completed" | "processing" | "processed" | "failed";
  fileSize: number;
  mimeType: string;
  duration: number | null;
  language: string | null;
  text: string | null;
  segments: Segment[] | null;
  speakers: Array<{ speaker: string; start: number; end: number }> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProcessedOutput {
  id: string;
  transcriptId: string;
  templateId: string;
  templateName: string | null;
  outputText: string;
  modelUsed: string;
  tokensUsed: number | null;
  processingTimeMs: number | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TranscriptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [outputs, setOutputs] = useState<ProcessedOutput[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [activeOutputTab, setActiveOutputTab] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [transcriptRes, outputsRes, templatesRes] = await Promise.all([
        authFetch(`/api/transcribe/${id}`),
        authFetch(`/api/process/${id}`),
        authFetch("/api/templates"),
      ]);

      if (!transcriptRes.ok) throw new Error("Transcript not found");

      const transcriptData = await transcriptRes.json();
      setTranscript(transcriptData);

      if (outputsRes.ok) {
        const outputsData = await outputsRes.json();
        setOutputs(outputsData.outputs || []);
        if (outputsData.outputs?.length > 0 && !activeOutputTab) {
          setActiveOutputTab(outputsData.outputs[0].id);
        }
      }

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(templatesData.templates || []);
        if (templatesData.templates?.length > 0 && !selectedTemplate) {
          setSelectedTemplate(templatesData.templates[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, activeOutputTab, selectedTemplate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for status while pipeline is active
  useEffect(() => {
    if (
      transcript?.status === "transcribing" ||
      transcript?.status === "pending" ||
      transcript?.status === "processing"
    ) {
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
  }, [transcript?.status, fetchData]);

  const handleProcess = async () => {
    if (!selectedTemplate) return;
    setProcessing(true);
    try {
      const res = await authFetch(`/api/process/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Processing failed");
      }

      const data = await res.json();
      setOutputs((prev) => [data, ...prev]);
      setActiveOutputTab(data.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleRetranscribe = async () => {
    setRetranscribing(true);
    try {
      const res = await authFetch(`/api/transcribe/${id}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Re-transcription failed");
      }
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Re-transcription failed");
    } finally {
      setRetranscribing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (!transcript?.text) return;
    const blob = new Blob([transcript.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${transcript.originalFilename.replace(/\.[^/.]+$/, "")}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner text="Loading transcript..." />;
  if (error || !transcript) {
    return (
      <ErrorState
        message={error || "Transcript not found"}
        onRetry={fetchData}
      />
    );
  }

  const activeOutput = outputs.find((o) => o.id === activeOutputTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/transcripts")}
            className="text-muted text-sm hover:text-foreground transition-colors mb-2 inline-flex items-center gap-1"
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back to Transcripts
          </button>
          <h1 className="text-2xl font-bold truncate">
            {transcript.originalFilename}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <StatusBadge status={transcript.status} />
            <span className="text-muted text-sm">
              {new Date(transcript.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {transcript.duration && (
              <span className="text-muted text-sm">
                {Math.floor(transcript.duration / 60)}m{" "}
                {transcript.duration % 60}s
              </span>
            )}
            <span className="text-muted text-sm">
              {formatFileSize(transcript.fileSize)}
            </span>
            {transcript.language && (
              <span className="text-muted text-sm uppercase">
                {transcript.language}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {transcript.status === "failed" && (
            <button
              onClick={handleRetranscribe}
              disabled={retranscribing}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              {retranscribing ? "Re-transcribing..." : "🔄 Re-transcribe"}
            </button>
          )}
          {transcript.text && (
            <>
              <button
                onClick={() => handleCopy(transcript.text!)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
              >
                📥 Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {transcript.status === "failed" && transcript.errorMessage && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <strong>Transcription failed:</strong> {transcript.errorMessage}
        </div>
      )}

      {/* Pipeline progress status */}
      {(transcript.status === "transcribing" ||
        transcript.status === "pending" ||
        transcript.status === "processing") && (
        <div className="p-8 bg-surface border border-border rounded-xl text-center">
          <LoadingSpinner
            text={
              transcript.status === "pending"
                ? "Waiting to start transcription..."
                : transcript.status === "transcribing"
                  ? "🎙️ Transcribing your audio..."
                  : "🤖 Applying AI template..."
            }
          />
        </div>
      )}

      {/* Content: Two panels */}
      {(transcript.status === "completed" || transcript.status === "processed") && transcript.text && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left: Transcript */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Transcript</h2>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {transcript.segments && transcript.segments.length > 0 ? (
                <div className="space-y-3">
                  {transcript.segments.map((seg, i) => (
                    <div key={i} className="group">
                      <div className="flex items-center gap-2 mb-1">
                        {seg.speaker && (
                          <span className="text-accent text-xs font-medium">
                            {seg.speaker}
                          </span>
                        )}
                        <span className="text-muted text-xs">
                          {formatTimestamp(seg.start)}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {transcript.text}
                </p>
              )}
            </div>
          </div>

          {/* Right: AI Outputs */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">AI Processing</h2>
            </div>

            {/* Process controls */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
                  disabled={templates.length === 0}
                >
                  {templates.length === 0 ? (
                    <option value="">No templates — create one first</option>
                  ) : (
                    templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={handleProcess}
                  disabled={processing || !selectedTemplate}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {processing ? "Processing..." : "Process"}
                </button>
              </div>
            </div>

            {/* Output tabs */}
            {outputs.length > 0 ? (
              <>
                <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
                  {outputs.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setActiveOutputTab(o.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        activeOutputTab === o.id
                          ? "bg-accent/10 text-accent"
                          : "text-muted hover:text-foreground hover:bg-surface-hover"
                      }`}
                    >
                      {o.templateName || "Output"}
                    </button>
                  ))}
                </div>
                {activeOutput && (
                  <div className="p-4 max-h-[400px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-muted text-xs">
                        {activeOutput.modelUsed} •{" "}
                        {activeOutput.tokensUsed} tokens •{" "}
                        {activeOutput.processingTimeMs
                          ? `${(activeOutput.processingTimeMs / 1000).toFixed(1)}s`
                          : ""}
                      </div>
                      <button
                        onClick={() => handleCopy(activeOutput.outputText)}
                        className="text-muted text-xs hover:text-accent transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {activeOutput.outputText}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center">
                <p className="text-muted text-sm">
                  No processed outputs yet.
                  {templates.length > 0
                    ? " Select a template and click Process."
                    : " Create a template first."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
