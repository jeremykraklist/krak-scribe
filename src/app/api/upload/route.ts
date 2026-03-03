import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { isAllowedFile, saveUploadedFile } from "@/lib/upload";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use form field 'file'." },
        { status: 400 }
      );
    }

    // Validate file type
    const originalFilename = file.name || "recording.m4a";
    const validation = isAllowedFile(originalFilename, file.type);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400 }
      );
    }

    // Save file to disk
    const uploadResult = await saveUploadedFile(file, originalFilename);

    // Create transcript record in DB
    const id = uuidv4();
    const now = new Date().toISOString();

    const [transcript] = await db
      .insert(transcripts)
      .values({
        id,
        userId,
        originalFilename,
        storedFilename: uploadResult.storedFilename,
        filePath: uploadResult.filePath,
        mimeType: uploadResult.mimeType,
        fileSize: uploadResult.fileSize,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(
      {
        transcript: {
          id: transcript.id,
          originalFilename: transcript.originalFilename,
          fileSize: transcript.fileSize,
          mimeType: transcript.mimeType,
          status: transcript.status,
          createdAt: transcript.createdAt,
        },
        message: "File uploaded successfully. Use POST /api/transcribe/{id} to start transcription.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);

    if (error instanceof Error && error.message.includes("File too large")) {
      return NextResponse.json(
        { error: error.message },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
