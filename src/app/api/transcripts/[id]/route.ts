import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

    return NextResponse.json({
      id: transcript.id,
      originalFilename: transcript.originalFilename,
      status: transcript.status,
      fileSize: transcript.fileSize,
      mimeType: transcript.mimeType,
      duration: transcript.duration,
      language: transcript.language,
      text: transcript.transcriptionText,
      segments: transcript.transcriptionSegments
        ? JSON.parse(transcript.transcriptionSegments)
        : null,
      speakers: transcript.speakerDiarization
        ? JSON.parse(transcript.speakerDiarization)
        : null,
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

    // Delete the transcript (processed_outputs will fail if FK constraint)
    // For now, just delete the transcript record
    await db
      .delete(transcripts)
      .where(and(eq(transcripts.id, id), eq(transcripts.userId, userId)));

    // Try to remove the uploaded file
    try {
      const { unlinkSync, existsSync } = await import("fs");
      if (transcript.filePath && existsSync(transcript.filePath)) {
        unlinkSync(transcript.filePath);
      }
    } catch {
      // Ignore file deletion errors
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (
      error instanceof Error &&
      /FOREIGN KEY constraint failed/i.test(error.message)
    ) {
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
