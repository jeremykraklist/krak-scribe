# PROJECT.md — KrakScribe

## Quick Start
- **Stack:** Next.js 15 + TypeScript + Tailwind + SQLite (Drizzle ORM)
- **Build:** `npm run build`
- **Dev:** `npm run dev` (port 3200)
- **Deploy:** Contabo VPS (157.173.203.33) via systemd

## What Is This?
Plaud Note Pin S transcript processing pipeline. Upload audio from Plaud (or any recorder), transcribe via local whisper.cpp, process through customizable AI prompt templates (Grok via OpenRouter), store and search results.

Eliminates $20/mo Plaud transcription subscription.

## Architecture
```text
Audio Upload (drag & drop / Plaud export)
    ↓
whisper.cpp (local transcription via ffmpeg → WAV → SRT)
    ↓
AI Template Processing (Grok 4.1 Fast via OpenRouter)
    ↓
SQLite Database (transcripts + processed outputs)
    ↓
Dashboard UI (search, browse, export)
```

## Key APIs
- `POST /api/upload` — upload audio files
- `POST /api/transcribe/[id]` — transcribe uploaded file
- `GET /api/transcribe/[id]` — get transcript detail
- `GET /api/transcripts` — list all transcripts
- `GET /api/transcripts/[id]` — get single transcript
- `POST /api/process/[id]` — apply AI template to transcript
- `GET /api/process/[id]` — get processed outputs for transcript
- `CRUD /api/templates` — manage prompt templates

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Upload + whisper.cpp transcribe + AI templates + dashboard | ✅ Complete |
| Phase 2 | Plaud SDK, auto-processing, webhooks | 🔄 In Progress |
| Phase 3 | Integration with KrakWhisper + calendar | 🔲 Future |

## GitHub
- Repo: jeremykraklist/krak-scribe
- Project Board: #4
- Slack: #software-dev-ops (C0AELU4T8JW)
