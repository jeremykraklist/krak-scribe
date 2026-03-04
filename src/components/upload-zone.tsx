"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const ACCEPTED_EXTENSIONS = ".m4a,.mp3,.wav,.webm,.ogg,.flac";

type PipelineStep = "idle" | "uploading" | "transcribing" | "processing" | "done" | "error";

const STEP_LABELS: Record<PipelineStep, string> = {
  idle: "",
  uploading: "Uploading audio...",
  transcribing: "Transcribing with Whisper...",
  processing: "Applying AI template...",
  done: "All done! Redirecting...",
  error: "Something went wrong",
};

const STEPS: { key: PipelineStep; icon: string; label: string }[] = [
  { key: "uploading", icon: "⬆️", label: "Upload" },
  { key: "transcribing", icon: "🎙️", label: "Transcribe" },
  { key: "processing", icon: "🤖", label: "Process" },
  { key: "done", icon: "✅", label: "Done" },
];

function getStepIndex(step: PipelineStep): number {
  const idx = STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : -1;
}

export default function UploadZone() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for transcript status after upload
  useEffect(() => {
    if (!transcriptId || step === "done" || step === "error" || step === "idle") {
      return;
    }

    const poll = async () => {
      try {
        const res = await authFetch(`/api/transcribe/${transcriptId}`);
        if (!res.ok) return;

        const data = await res.json();
        const status = data.status as string;

        if (status === "transcribing") {
          setStep("transcribing");
        } else if (status === "processing") {
          setStep("processing");
        } else if (status === "processed") {
          setStep("done");
          // Redirect to transcript detail after a brief moment
          setTimeout(() => {
            router.push(`/transcripts/${transcriptId}`);
          }, 800);
        } else if (status === "completed") {
          // Transcription done but no auto-process (no default template)
          setStep("done");
          setTimeout(() => {
            router.push(`/transcripts/${transcriptId}`);
          }, 800);
        } else if (status === "failed") {
          setStep("error");
          setError(data.errorMessage || "Pipeline failed");
        }
      } catch {
        // Silently retry on poll errors
      }
    };

    // Start polling
    pollRef.current = setInterval(poll, 2000);
    // Also poll immediately
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [transcriptId, step, router]);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setStep("uploading");
      setFileName(file.name);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await response.json();
        setTranscriptId(data.transcript.id);
        setStep("transcribing"); // Upload done, pipeline starts
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setStep("error");
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleReset = () => {
    setStep("idle");
    setError(null);
    setFileName(null);
    setTranscriptId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const isActive = step !== "idle";
  const currentStepIndex = getStepIndex(step);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Drop zone / Pipeline progress */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isActive) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={isActive ? undefined : handleDrop}
        onClick={() => !isActive && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all duration-200 ${
          isDragging
            ? "border-accent bg-accent/5 scale-[1.02] cursor-pointer"
            : isActive
              ? "border-border bg-surface cursor-default"
              : "border-border hover:border-accent/50 hover:bg-surface-hover cursor-pointer"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isActive}
        />

        {isActive ? (
          <div className="space-y-6">
            {/* File name */}
            <p className="text-sm font-medium text-muted truncate px-4">
              {fileName}
            </p>

            {/* Pipeline steps */}
            <div className="flex items-center justify-center gap-2 sm:gap-4">
              {STEPS.map((s, i) => {
                const isCompleted = currentStepIndex > i;
                const isCurrent = currentStepIndex === i;
                const isPending = currentStepIndex < i;
                const isFailed = step === "error" && isCurrent;

                return (
                  <div key={s.key} className="flex items-center gap-2 sm:gap-4">
                    {/* Step circle */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl transition-all duration-300 ${
                          isFailed
                            ? "bg-red-500/10 border-2 border-red-500/40"
                            : isCompleted
                              ? "bg-green-500/10 border-2 border-green-500/40"
                              : isCurrent
                                ? "bg-accent/10 border-2 border-accent/40 animate-pulse"
                                : "bg-surface border-2 border-border opacity-40"
                        }`}
                      >
                        {isFailed ? "❌" : isCompleted ? "✓" : s.icon}
                      </div>
                      <span
                        className={`text-[10px] sm:text-xs font-medium ${
                          isFailed
                            ? "text-red-400"
                            : isCompleted
                              ? "text-green-400"
                              : isCurrent
                                ? "text-accent"
                                : "text-muted opacity-40"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>

                    {/* Connector line */}
                    {i < STEPS.length - 1 && (
                      <div
                        className={`hidden sm:block w-8 h-0.5 rounded-full transition-all duration-300 mb-5 ${
                          isCompleted
                            ? "bg-green-500/40"
                            : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Status text */}
            <p className={`text-sm ${step === "error" ? "text-red-400" : "text-muted"}`}>
              {STEP_LABELS[step]}
            </p>

            {/* Error retry */}
            {step === "error" && (
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-medium">Drop your audio file here</p>
              <p className="text-muted text-sm mt-1">or tap to browse</p>
            </div>
            <p className="text-muted text-xs">
              Supports: M4A, MP3, WAV, WebM, OGG, FLAC • Max 100MB
            </p>
            <p className="text-accent/70 text-xs font-medium">
              Zero-click: upload → auto-transcribe → auto-process → done
            </p>
          </div>
        )}
      </div>

      {/* Error banner (for non-pipeline errors) */}
      {error && step !== "error" && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
