# KrakScribe

Plaud Note Pin S transcript processing pipeline. Upload audio, transcribe locally via whisper.cpp, process through customizable AI prompt templates.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env
# Edit .env with your API keys, JWT secret, and whisper model path

# Run dev server (port 3200)
npm run dev
```

## Whisper.cpp Model Options

KrakScribe uses [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for local audio transcription. The model is configured via the `WHISPER_MODEL` environment variable.

### Available Models

| Model | File | Size | RAM Usage | Speed | Accuracy | Recommended For |
|-------|------|------|-----------|-------|----------|-----------------|
| tiny.en | `ggml-tiny.en.bin` | 75 MB | ~400 MB | Fastest | Low | Testing only |
| base.en | `ggml-base.en.bin` | 142 MB | ~500 MB | Fast | Fair | Low-resource servers |
| small.en | `ggml-small.en.bin` | 466 MB | ~1 GB | Medium | Good | Budget servers (2-4GB RAM) |
| **medium.en** | **`ggml-medium.en.bin`** | **1.5 GB** | **~2 GB** | Slower | **Very Good** | **Production (recommended)** |
| large-v3 | `ggml-large-v3.bin` | 3.1 GB | ~4 GB | Slowest | Best | High-resource servers only |

### Downloading Models

Models are downloaded from Hugging Face:

```bash
cd /opt/whisper.cpp/models

# Recommended: medium.en (best accuracy/resource tradeoff)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin

# Fallback: small.en (if RAM is tight)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin

# Minimal: base.en (already included)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

### Configuration

Set the model path in your `.env` file:

```bash
# Point to the desired model
WHISPER_MODEL=/opt/whisper.cpp/models/ggml-medium.en.bin

# Adjust thread count based on available CPU cores
WHISPER_THREADS=4
```

### Notes

- `.en` models are English-only and faster/more accurate for English audio than multilingual equivalents
- `medium.en` provides the best accuracy-to-resource ratio for English transcription
- The server needs sufficient RAM for the model + application overhead (~1GB for Next.js)
- `base.en` is kept as a fallback model (do not delete)

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
- **Transcription:** Local whisper.cpp (medium.en model)
- **AI Processing:** OpenRouter API (configurable models per template)
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
      templates/       — CRUD for AI prompt templates
      process/[id]/    — AI processing of transcripts
    globals.css        — Theme (dark, orange accents)
    layout.tsx         — Root layout
    page.tsx           — Landing page
  lib/
    auth.ts            — Auth helpers (hash, JWT, verify)
    db/
      index.ts         — Database connection + init
      schema.ts        — Drizzle schema (users, transcripts, templates, processed_outputs)
    upload.ts          — File upload helpers
    transcribe.ts      — whisper.cpp integration
    process.ts         — AI processing via OpenRouter
  components/          — UI components
data/
  uploads/             — Uploaded audio files
  krak-scribe.db       — SQLite database
```
