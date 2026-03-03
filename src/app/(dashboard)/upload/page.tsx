"use client";

import UploadZone from "@/components/upload-zone";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Upload Audio</h1>
        <p className="text-muted text-sm mt-1">
          Upload a recording from Plaud Note Pin S or any audio source.
          Transcription starts automatically.
        </p>
      </div>

      <UploadZone />

      {/* Tips */}
      <div className="max-w-2xl mx-auto">
        <h3 className="text-sm font-medium text-muted mb-3">Tips</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-sm font-medium mb-1">🎙️ Best Quality</p>
            <p className="text-muted text-xs">
              M4A or WAV files from Plaud produce the best transcription
              results with speaker diarization.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-sm font-medium mb-1">📏 File Size</p>
            <p className="text-muted text-xs">
              Files up to 100MB are supported. Longer recordings may take a
              few minutes to transcribe.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-sm font-medium mb-1">🤖 Auto-Process</p>
            <p className="text-muted text-xs">
              After transcription, apply AI templates to extract summaries,
              action items, and more.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-sm font-medium mb-1">🔒 Secure</p>
            <p className="text-muted text-xs">
              Files are stored securely on your server. Only you can access
              your transcripts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
