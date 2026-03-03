import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { processTranscript } from "@/lib/process";
import { db } from "@/lib/db";
import { transcripts, templates, processedOutputs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/process/[transcriptId] — Process a transcript with an AI template.
 * Body: { templateId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transcriptId: string }> }
) {
  try {
    const { transcriptId } = await params;
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 }
      );
    }

    const { templateId } = (body ?? {}) as Record<string, unknown>;

    if (typeof templateId !== "string" || templateId.trim().length === 0) {
      return NextResponse.json(
        { error: "templateId is required in the request body" },
        { status: 400 }
      );
    }

    // Fetch transcript (must be owned by user and completed)
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(
        and(
          eq(transcripts.id, transcriptId),
          eq(transcripts.userId, userId)
        )
      )
      .limit(1);

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    if (transcript.status !== "completed") {
      return NextResponse.json(
        {
          error: `Transcript status is "${transcript.status}". Must be "completed" before processing.`,
        },
        { status: 400 }
      );
    }

    if (!transcript.transcriptionText) {
      return NextResponse.json(
        { error: "Transcript has no text content to process" },
        { status: 400 }
      );
    }

    // Fetch template (must be owned by user)
    const [template] = await db
      .select()
      .from(templates)
      .where(
        and(eq(templates.id, templateId), eq(templates.userId, userId))
      )
      .limit(1);

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Process through AI
    const result = await processTranscript(transcript, template);

    // Store result
    const outputId = uuidv4();
    const [output] = await db
      .insert(processedOutputs)
      .values({
        id: outputId,
        transcriptId: transcript.id,
        templateId: template.id,
        userId,
        outputText: result.outputText,
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed,
        processingTimeMs: result.processingTimeMs,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(
      {
        id: output.id,
        transcriptId: output.transcriptId,
        templateId: output.templateId,
        templateName: template.name,
        outputText: output.outputText,
        modelUsed: output.modelUsed,
        tokensUsed: output.tokensUsed,
        processingTimeMs: output.processingTimeMs,
        createdAt: output.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Process transcript error:", error);
    return NextResponse.json(
      { error: "Failed to process transcript. Please try again." },
      { status: 502 }
    );
  }
}

/**
 * GET /api/process/[transcriptId] — Get all processed outputs for a transcript.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transcriptId: string }> }
) {
  try {
    const { transcriptId } = await params;
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    // Verify transcript ownership
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(
        and(
          eq(transcripts.id, transcriptId),
          eq(transcripts.userId, userId)
        )
      )
      .limit(1);

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    // Get all processed outputs for this transcript
    const outputs = await db
      .select({
        id: processedOutputs.id,
        transcriptId: processedOutputs.transcriptId,
        templateId: processedOutputs.templateId,
        templateName: templates.name,
        outputText: processedOutputs.outputText,
        modelUsed: processedOutputs.modelUsed,
        tokensUsed: processedOutputs.tokensUsed,
        processingTimeMs: processedOutputs.processingTimeMs,
        createdAt: processedOutputs.createdAt,
      })
      .from(processedOutputs)
      .leftJoin(templates, eq(processedOutputs.templateId, templates.id))
      .where(eq(processedOutputs.transcriptId, transcriptId))
      .orderBy(desc(processedOutputs.createdAt));

    return NextResponse.json({
      transcriptId,
      transcriptFilename: transcript.originalFilename,
      outputs,
      count: outputs.length,
    });
  } catch (error) {
    console.error("Get processed outputs error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
