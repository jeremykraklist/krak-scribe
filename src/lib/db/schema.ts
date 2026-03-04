import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const transcripts = sqliteTable("transcripts", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  originalFilename: text("original_filename").notNull(),
  storedFilename: text("stored_filename").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(), // bytes
  duration: integer("duration"), // seconds, populated after transcription
  status: text("status", {
    enum: ["pending", "transcribing", "completed", "processing", "processed", "failed"],
  })
    .notNull()
    .default("pending"),
  transcriptionText: text("transcription_text"),
  transcriptionSegments: text("transcription_segments"), // JSON string of segments with timestamps
  speakerDiarization: text("speaker_diarization"), // JSON string of speaker segments
  language: text("language"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template").notNull(),
  model: text("model").notNull().default("x-ai/grok-4.1-fast"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const processedOutputs = sqliteTable("processed_outputs", {
  id: text("id").primaryKey(), // UUID
  transcriptId: text("transcript_id")
    .notNull()
    .references(() => transcripts.id),
  templateId: text("template_id")
    .notNull()
    .references(() => templates.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  outputText: text("output_text").notNull(),
  modelUsed: text("model_used").notNull(),
  tokensUsed: integer("tokens_used"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type ProcessedOutput = typeof processedOutputs.$inferSelect;
export type NewProcessedOutput = typeof processedOutputs.$inferInsert;
