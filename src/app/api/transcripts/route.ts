import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const search = request.nextUrl.searchParams.get("search") || "";

    let results;
    if (search) {
      results = await db
        .select()
        .from(transcripts)
        .where(
          eq(transcripts.userId, userId)
        )
        .orderBy(desc(transcripts.createdAt));

      // Filter in JS since SQLite FTS isn't set up
      const searchLower = search.toLowerCase();
      results = results.filter(
        (t) =>
          t.originalFilename.toLowerCase().includes(searchLower) ||
          (t.transcriptionText &&
            t.transcriptionText.toLowerCase().includes(searchLower))
      );
    } else {
      results = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.userId, userId))
        .orderBy(desc(transcripts.createdAt));
    }

    return NextResponse.json({
      transcripts: results.map((t) => ({
        id: t.id,
        originalFilename: t.originalFilename,
        fileSize: t.fileSize,
        mimeType: t.mimeType,
        duration: t.duration,
        status: t.status,
        language: t.language,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        // Include a preview of text for search results
        textPreview: t.transcriptionText
          ? t.transcriptionText.slice(0, 200)
          : null,
      })),
    });
  } catch (error) {
    console.error("List transcripts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
