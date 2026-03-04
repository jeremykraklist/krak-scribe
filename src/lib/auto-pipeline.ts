import { db } from "./db";
import { transcripts, templates, processedOutputs } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { transcribeFile } from "./transcribe";
import { processTranscript } from "./process";
import { v4 as uuidv4 } from "uuid";

/**
 * Auto-pipeline: transcribe an audio file and apply the user's default template.
 * Runs in the background (fire-and-forget from the upload handler).
 *
 * Status flow: pending → transcribing → processing → processed
 * On failure at any step: → failed
 * If no default template exists: pending → transcribing → completed (no auto-process)
 */
export async function runAutoPipeline(
  transcriptId: string,
  userId: string
): Promise<void> {
  try {
    // 1. Fetch the transcript record
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(
        and(eq(transcripts.id, transcriptId), eq(transcripts.userId, userId))
      )
      .limit(1);

    if (!transcript) {
      console.error(`[auto-pipeline] Transcript ${transcriptId} not found`);
      return;
    }

    // 2. Update status to transcribing
    await db
      .update(transcripts)
      .set({
        status: "transcribing",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, transcriptId));

    // 3. Transcribe the audio file
    let result;
    try {
      result = await transcribeFile(transcript.filePath);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown transcription error";
      console.error(
        `[auto-pipeline] Transcription failed for ${transcriptId}:`,
        errorMessage
      );
      await db
        .update(transcripts)
        .set({
          status: "failed",
          errorMessage,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(transcripts.id, transcriptId));
      return;
    }

    // 4. Save transcription results
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

    // 5. Find the user's default template
    const [defaultTemplate] = await db
      .select()
      .from(templates)
      .where(
        and(eq(templates.userId, userId), eq(templates.isDefault, true))
      )
      .limit(1);

    if (!defaultTemplate) {
      console.log(
        `[auto-pipeline] No default template for user ${userId}, stopping after transcription`
      );
      // Status stays "completed" — transcription done, no auto-process
      return;
    }

    // 6. Update status to processing
    await db
      .update(transcripts)
      .set({
        status: "processing",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, transcriptId));

    // 7. Re-fetch the transcript with updated transcription data
    const [updatedTranscript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.id, transcriptId))
      .limit(1);

    if (!updatedTranscript) {
      console.error(
        `[auto-pipeline] Transcript ${transcriptId} disappeared after transcription`
      );
      return;
    }

    // 8. Process through AI template
    let processResult;
    try {
      processResult = await processTranscript(updatedTranscript, defaultTemplate);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown processing error";
      console.error(
        `[auto-pipeline] Template processing failed for ${transcriptId}:`,
        errorMessage
      );
      // Don't mark as failed — transcription succeeded. Revert to completed.
      await db
        .update(transcripts)
        .set({
          status: "completed",
          errorMessage: `Auto-process failed: ${errorMessage}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(transcripts.id, transcriptId));
      return;
    }

    // 9. Save processed output
    const outputId = uuidv4();
    await db.insert(processedOutputs).values({
      id: outputId,
      transcriptId: transcriptId,
      templateId: defaultTemplate.id,
      userId,
      outputText: processResult.outputText,
      modelUsed: processResult.modelUsed,
      tokensUsed: processResult.tokensUsed,
      processingTimeMs: processResult.processingTimeMs,
      createdAt: new Date().toISOString(),
    });

    // 10. Mark as fully processed
    await db
      .update(transcripts)
      .set({
        status: "processed",
        errorMessage: null, // Clear any previous error
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, transcriptId));

    console.log(
      `[auto-pipeline] ✅ Transcript ${transcriptId} fully processed with template "${defaultTemplate.name}"`
    );
  } catch (err) {
    console.error(`[auto-pipeline] Unexpected error for ${transcriptId}:`, err);
    try {
      await db
        .update(transcripts)
        .set({
          status: "failed",
          errorMessage:
            err instanceof Error ? err.message : "Unexpected pipeline error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(transcripts.id, transcriptId));
    } catch {
      // Best-effort status update
    }
  }
}
