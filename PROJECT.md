# PROJECT.md — KrakScribe

## Quick Start
- **Stack:** Next.js 15 + TypeScript + Tailwind + SQLite (Drizzle ORM)
- **Build:** `npm run build`
- **Dev:** `npm run dev` (port 3200)
- **Deploy:** Contabo VPS (157.173.203.33) via systemd

## What Is This?
Plaud Note Pin S transcript processing pipeline. Upload audio from Plaud (or any recorder), transcribe cheaply via Groq Whisper, process through customizable AI prompt templates, store and search results.

Eliminates $20/mo Plaud transcription subscription.

## Architecture
```
Audio Upload (drag & drop / Plaud export)
    ↓
Groq Whisper API (transcribe + diarize)
    ↓
AI Template Processing (Grok 4.1 Fast)
    ↓
SQLite Database (transcripts + processed outputs)
    ↓
Dashboard UI (search, browse, export)
```

## Key APIs
- `POST /api/upload` — upload audio files
- `POST /api/transcribe/[id]` — transcribe uploaded file
- `POST /api/process/[id]` — apply AI template to transcript
- `CRUD /api/templates` — manage prompt templates

## Phases
| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Upload + Groq transcribe + AI templates + dashboard | 🔲 Not started |
| Phase 2 | Plaud SDK, auto-processing, webhooks | 🔲 Future |
| Phase 3 | Integration with KrakWhisper + calendar | 🔲 Future |

## GitHub
- Repo: jeremykraklist/krak-scribe
- Project Board: #4
- Slack: #software-dev-ops (C0AELU4T8JW)
