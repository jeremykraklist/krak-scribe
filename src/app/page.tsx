export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">
          <span className="text-accent">Krak</span>Scribe
        </h1>
        <p className="text-muted text-lg mb-8">
          Plaud Note Pin S transcript processing pipeline.
          <br />
          Upload audio → Transcribe via Groq Whisper → Process with AI templates.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-accent text-2xl mb-2">🎙️</div>
            <h3 className="font-semibold mb-1">Upload</h3>
            <p className="text-muted text-sm">
              Drag & drop audio files from Plaud or any recorder
            </p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-accent text-2xl mb-2">📝</div>
            <h3 className="font-semibold mb-1">Transcribe</h3>
            <p className="text-muted text-sm">
              Groq Whisper with speaker diarization
            </p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-accent text-2xl mb-2">🤖</div>
            <h3 className="font-semibold mb-1">Process</h3>
            <p className="text-muted text-sm">
              Apply custom AI prompt templates
            </p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <a
            href="/api/health"
            className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
          >
            Health Check
          </a>
        </div>

        <p className="text-muted text-xs mt-8">
          v0.1.0 — API-first. Dashboard UI coming in Phase 1.
        </p>
      </div>
    </main>
  );
}
