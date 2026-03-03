import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { listRecordings, downloadAudio, checkConnection } from "@/lib/plaud-client";
import { transcribeFile } from "@/lib/transcribe";
import { processTranscript } from "@/lib/process";
import { db } from "@/lib/db";
import { transcripts, templates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { processedOutputs } from "@/lib/db/schema";
import path from "path";

// In-memory sync state (reset on restart, that's fine)
let lastSyncTime: string | null = null;
let syncInProgress = false;
let lastSyncResult: {
  synced: number;
  skipped: number;
  errors: string[];
  total: number;
} | null = null;

/**
 * GET /api/sync/plaud — Get sync status and Plaud connection info.
 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const connection = await checkConnection();

  // Count synced transcripts (ones with plaud_ prefix in stored filename)
  const syncedTranscripts = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.userId, userId));

  const plaudCount = syncedTranscripts.filter(
    (t) => t.storedFilename.startsWith("plaud_")
  ).length;

  return NextResponse.json({
    connected: connection.connected,
    plaudFileCount: connection.fileCount ?? 0,
    syncedCount: plaudCount,
    lastSyncTime,
    syncInProgress,
    lastSyncResult,
    error: connection.error,
  });
}

/**
 * POST /api/sync/plaud — Trigger a sync from Plaud.
 * Downloads new recordings, transcribes, and optionally processes with default template.
 */
export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (syncInProgress) {
    return NextResponse.json(
      { error: "Sync already in progress", lastSyncTime },
      { status: 409 }
    );
  }

  syncInProgress = true;
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  try {
    // 1. List all recordings from Plaud
    const plaudFiles = await listRecordings();

    // 2. Get existing plaud file IDs from our DB (matched by stored filename pattern)
    const existingTranscripts = await db
      .select({
        storedFilename: transcripts.storedFilename,
      })
      .from(transcripts)
      .where(eq(transcripts.userId, userId));

    // Extract plaud file IDs from stored filenames (pattern: plaud_{id}.mp3)
    const existingPlaudIds = new Set(
      existingTranscripts
        .map((t) => {
          const match = t.storedFilename.match(/^plaud_(.+)\.mp3$/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    // 3. Find new files to sync
    const newFiles = plaudFiles.filter(
      (f) => !existingPlaudIds.has(f.id)
    );

    if (newFiles.length === 0) {
      lastSyncTime = new Date().toISOString();
      lastSyncResult = {
        synced: 0,
        skipped: plaudFiles.length,
        errors: [],
        total: plaudFiles.length,
      };
      syncInProgress = false;

      return NextResponse.json({
        message: "No new recordings to sync",
        total: plaudFiles.length,
        synced: 0,
        skipped: plaudFiles.length,
      });
    }

    // 4. Download and import each new file
    const uploadDir = path.join(process.cwd(), "data", "uploads");

    // Get default template for auto-processing
    const [defaultTemplate] = await db
      .select()
      .from(templates)
      .where(
        and(eq(templates.userId, userId), eq(templates.isDefault, true))
      )
      .limit(1);

    for (const file of newFiles) {
      try {
        // Download audio from Plaud
        const { filePath, fileSize } = await downloadAudio(
          file.id,
          uploadDir,
          file.id
        );

        // Create transcript record
        const transcriptId = uuidv4();
        const now = new Date().toISOString();
        const displayName =
          file.filename || file.fullname || `Plaud Recording ${file.id.substring(0, 8)}`;

        await db.insert(transcripts).values({
          id: transcriptId,
          userId,
          originalFilename: displayName,
          storedFilename: `plaud_${file.id}.mp3`,
          filePath,
          mimeType: "audio/mpeg",
          fileSize,
          duration: Math.round(file.duration / 1000), // ms to seconds
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });

        // Auto-transcribe in background (don't block the sync response)
        transcribeAndProcess(transcriptId, filePath, userId, defaultTemplate).catch(
          (err) => {
            console.error(`Background transcription failed for ${transcriptId}:`, err);
          }
        );

        synced++;
      } catch (fileError) {
        const errMsg =
          fileError instanceof Error ? fileError.message : "Unknown error";
        errors.push(`${file.filename || file.id}: ${errMsg}`);
        console.error(`Failed to sync Plaud file ${file.id}:`, fileError);
      }
    }

    skipped = plaudFiles.length - newFiles.length;
    lastSyncTime = new Date().toISOString();
    lastSyncResult = {
      synced,
      skipped,
      errors,
      total: plaudFiles.length,
    };

    return NextResponse.json({
      message: `Synced ${synced} new recording(s)`,
      total: plaudFiles.length,
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Plaud sync error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Unknown error";
    lastSyncResult = {
      synced,
      skipped,
      errors: [...errors, errMsg],
      total: 0,
    };

    return NextResponse.json(
      { error: `Sync failed: ${errMsg}` },
      { status: 500 }
    );
  } finally {
    syncInProgress = false;
  }
}

/**
 * Background: Transcribe audio and auto-process with default template.
 */
async function transcribeAndProcess(
  transcriptId: string,
  filePath: string,
  userId: string,
  defaultTemplate: typeof templates.$inferSelect | undefined
): Promise<void> {
  // Update status to transcribing
  await db
    .update(transcripts)
    .set({
      status: "transcribing",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(transcripts.id, transcriptId));

  try {
    // Transcribe with whisper.cpp
    const result = await transcribeFile(filePath);

    // Update transcript with results
    await db
      .update(transcripts)
      .set({
        status: "completed",
        transcriptionText: result.text,
        transcriptionSegments: JSON.stringify(result.segments),
        speakerDiarization: JSON.stringify(result.speakers || []),
        language: result.language,
        duration: Math.round(result.duration),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, transcriptId));

    console.log(`Transcription complete for ${transcriptId}`);

    // Auto-process with default template if one is set
    if (defaultTemplate) {
      try {
        const [transcript] = await db
          .select()
          .from(transcripts)
          .where(eq(transcripts.id, transcriptId))
          .limit(1);

        if (transcript && transcript.transcriptionText) {
          const processResult = await processTranscript(transcript, defaultTemplate);

          await db.insert(processedOutputs).values({
            id: uuidv4(),
            transcriptId,
            templateId: defaultTemplate.id,
            userId,
            outputText: processResult.outputText,
            modelUsed: processResult.modelUsed,
            tokensUsed: processResult.tokensUsed,
            processingTimeMs: processResult.processingTimeMs,
            createdAt: new Date().toISOString(),
          });

          console.log(
            `Auto-processed ${transcriptId} with template "${defaultTemplate.name}"`
          );
        }
      } catch (processError) {
        console.error(
          `Auto-process failed for ${transcriptId}:`,
          processError
        );
        // Don't fail the whole operation — transcription succeeded
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown transcription error";

    await db
      .update(transcripts)
      .set({
        status: "failed",
        errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, transcriptId));

    console.error(`Transcription failed for ${transcriptId}:`, error);
  }
}
