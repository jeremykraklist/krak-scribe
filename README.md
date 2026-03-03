# KrakScribe

Plaud Note Pin S transcript processing pipeline. Upload audio, transcribe via Groq Whisper, process through customizable AI prompt templates.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env
# Edit .env with your GROQ_API_KEY and JWT_SECRET

# Run dev server (port 3200)
npm run dev
```

## API Endpoints

### Health
```
GET /api/health
```

### Auth
```
POST /api/auth/register  { email, password, name? }
POST /api/auth/login     { email, password }
```
Both return `{ user, token }`. Use token as `Authorization: Bearer <token>`.

### Upload
```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
Body: file (audio: m4a, mp3, wav, webm, ogg, flac)
```

### Transcribe
```
POST /api/transcribe/:id   — Start transcription
GET  /api/transcribe/:id   — Get transcript status/result
Authorization: Bearer <token>
```

## Tech Stack

- **Framework:** Next.js 15 + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** SQLite via Drizzle ORM
- **Auth:** bcrypt + JWT
- **Transcription:** Groq Whisper (whisper-large-v3-turbo)
- **Port:** 3200

## Project Structure

```
src/
  app/
    api/
      auth/login/      — Login endpoint
      auth/register/   — Registration endpoint
      health/          — Health check
      upload/          — File upload
      transcribe/[id]/ — Transcription start + status
    globals.css        — Theme (dark, orange accents)
    layout.tsx         — Root layout
    page.tsx           — Landing page
  lib/
    auth.ts            — Auth helpers (hash, JWT, verify)
    db/
      index.ts         — Database connection + init
      schema.ts        — Drizzle schema (users, transcripts, templates, processed_outputs)
    upload.ts          — File upload helpers
    transcribe.ts      — Groq Whisper integration + chunking
  components/          — UI components (coming in Phase 1 dashboard)
data/
  uploads/             — Uploaded audio files
  krak-scribe.db       — SQLite database
```
