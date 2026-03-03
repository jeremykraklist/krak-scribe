"use client";

import { useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-client";

const ACCEPTED_EXTENSIONS = ".m4a,.mp3,.wav,.webm,.ogg,.flac";

export default function UploadZone() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(0);
      setFileName(file.name);

      try {
        // Simulate progress (since fetch doesn't give upload progress natively)
        const progressInterval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            return prev + Math.random() * 15;
          });
        }, 200);

        const formData = new FormData();
        formData.append("file", file);

        const response = await authFetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await response.json();
        setProgress(100);

        // Auto-start transcription
        await authFetch(`/api/transcribe/${data.transcript.id}`, {
          method: "POST",
        });

        // Redirect to transcript detail regardless of transcription result
        setTimeout(() => {
          router.push(`/transcripts/${data.transcript.id}`);
        }, 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
        setProgress(0);
      }
    },
    [router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-accent bg-accent/5 scale-[1.02]"
            : uploading
              ? "border-border bg-surface cursor-default"
              : "border-border hover:border-accent/50 hover:bg-surface-hover"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />

        {uploading ? (
          <div className="space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-accent animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">{fileName}</p>
              <p className="text-muted text-xs mt-1">
                {progress < 90
                  ? "Uploading..."
                  : progress < 100
                    ? "Transcribing..."
                    : "Done!"}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full max-w-xs mx-auto bg-border rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
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
              <p className="text-lg font-medium">
                Drop your audio file here
              </p>
              <p className="text-muted text-sm mt-1">
                or click to browse
              </p>
            </div>
            <p className="text-muted text-xs">
              Supports: M4A, MP3, WAV, WebM, OGG, FLAC • Max 100MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
