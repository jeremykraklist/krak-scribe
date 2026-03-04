import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { transcribeFile } from "@/lib/transcribe";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    // Fetch transcript record
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

    // Check status
    if (transcript.status === "transcribing") {
      return NextResponse.json(
        { error: "Transcription already in progress" },
        { status: 409 }
      );
    }

    if (transcript.status === "completed" || transcript.status === "processed") {
      return NextResponse.json(
        { error: "Already transcribed. Use GET to retrieve the transcript." },
        { status: 409 }
      );
    }

    if (transcript.status === "processing") {
      return NextResponse.json(
        { error: "Template processing in progress" },
        { status: 409 }
      );
    }

    // Update status to transcribing
    await db
      .update(transcripts)
      .set({
        status: "transcribing",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(transcripts.id, id));

    try {
      // Perform transcription
      const result = await transcribeFile(transcript.filePath);

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
        .where(eq(transcripts.id, id));

      return NextResponse.json({
        id: transcript.id,
        status: "completed",
        text: result.text,
        language: result.language,
        duration: result.duration,
        segmentCount: result.segments.length,
        speakerCount: result.speakers?.length || 0,
        speakers: result.speakers,
      });
    } catch (transcribeError) {
      // Mark as failed
      const errorMessage =
        transcribeError instanceof Error
          ? transcribeError.message
          : "Unknown transcription error";

      await db
        .update(transcripts)
        .set({
          status: "failed",
          errorMessage,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(transcripts.id, id));

      return NextResponse.json(
        {
          id: transcript.id,
          status: "failed",
          error: errorMessage,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Transcription endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    // Fetch transcript
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
