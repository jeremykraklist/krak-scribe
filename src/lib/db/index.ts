import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_URL || "./data/krak-scribe.db";

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _initialized = false;

function getSqlite(): Database.Database {
  if (!_sqlite) {
    // Ensure data directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    _sqlite = new Database(DB_PATH);
    _sqlite.pragma("journal_mode = WAL");
    _sqlite.pragma("foreign_keys = ON");
    _sqlite.pragma("busy_timeout = 5000");
  }
  return _sqlite;
}

function ensureInitialized(): void {
  if (_initialized) return;

  const sqlite = getSqlite();

  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        duration INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        transcription_text TEXT,
        transcription_segments TEXT,
        speaker_diarization TEXT,
        language TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT NOT NULL,
        user_prompt_template TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'x-ai/grok-4.1-fast',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_outputs (
        id TEXT PRIMARY KEY,
        transcript_id TEXT NOT NULL REFERENCES transcripts(id),
        template_id TEXT NOT NULL REFERENCES templates(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        output_text TEXT NOT NULL,
        model_used TEXT NOT NULL,
        tokens_used INTEGER,
        processing_time_ms INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transcripts_user_id ON transcripts(user_id);
      CREATE INDEX IF NOT EXISTS idx_transcripts_status ON transcripts(status);
      CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
      CREATE INDEX IF NOT EXISTS idx_processed_outputs_transcript_id ON processed_outputs(transcript_id);
    `);

    // Migrate old templates schema if needed
    const tableInfo = sqlite
      .prepare("PRAGMA table_info(templates)")
      .all() as Array<{ name: string }>;
    const columns = tableInfo.map((c) => c.name);

    if (columns.includes("prompt_template") && !columns.includes("system_prompt")) {
      sqlite.exec("BEGIN");
      try {
        sqlite.exec(`
          ALTER TABLE templates ADD COLUMN system_prompt TEXT NOT NULL DEFAULT '';
          ALTER TABLE templates ADD COLUMN model TEXT NOT NULL DEFAULT 'x-ai/grok-4.1-fast';
          ALTER TABLE templates RENAME COLUMN prompt_template TO user_prompt_template;
        `);
        sqlite.exec("COMMIT");
      } catch (migrationError) {
        sqlite.exec("ROLLBACK");
        console.error("Templates migration failed:", migrationError);
        throw migrationError;
      }
    }

    _initialized = true;
  } catch (error) {
    _initialized = false;
    console.error("Database initialization failed:", error);
    throw error;
  }
}

// Lazy proxy: initializes on first property access
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      if (!_db) {
        ensureInitialized();
        _db = drizzle(getSqlite(), { schema });
      }
      return Reflect.get(_db, prop, receiver);
    },
  }
);
