import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Detect foreign key constraint errors across SQLite drivers and ORMs.
 * Checks driver-specific error codes and falls back to message regex.
 */
function isForeignKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check driver-specific error codes (better-sqlite3, libsql, etc.)
  const errWithCode = error as Error & { code?: string };
  if (
    errWithCode.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    errWithCode.code === "SQLITE_CONSTRAINT"
  ) {
    return true;
  }

  // Fallback: regex match on message (covers most SQLite drivers)
  return /FOREIGN KEY constraint failed/i.test(error.message);
}

/**
 * GET /api/transcripts/[id] — Get a single transcript by ID.
 * Returns the transcript record with parsed segments and speakers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, userId)))
      .limit(1);

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    const safeParse = (value: string | null): unknown => {
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    return NextResponse.json({
      id: transcript.id,
      originalFilename: transcript.originalFilename,
      status: transcript.status,
      fileSize: transcript.fileSize,
      mimeType: transcript.mimeType,
      duration: transcript.duration,
      language: transcript.language,
      text: transcript.transcriptionText,
      segments: safeParse(transcript.transcriptionSegments),
      speakers: safeParse(transcript.speakerDiarization),
      errorMessage: transcript.errorMessage,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
    });
  } catch (error) {
    console.error("Get transcript error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transcripts/[id] — Delete a transcript and its associated data.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, userId)))
      .limit(1);

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    // Try to remove the uploaded file first (best-effort, avoids orphaned files)
    if (transcript.filePath) {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(transcript.filePath);
      } catch {
        // Ignore file deletion errors (e.g. ENOENT, permission issues)
      }
    }

    // Delete the transcript (processed_outputs will fail if FK constraint)
    await db
      .delete(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, userId)));

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (isForeignKeyError(error)) {
      return NextResponse.json(
        {
          error:
            "Transcript has processed outputs and cannot be deleted. Delete outputs first.",
        },
        { status: 409 }
      );
    }
    console.error("Delete transcript error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
