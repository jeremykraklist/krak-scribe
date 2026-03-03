import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { transcripts, templates, processedOutputs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Substitutes template variables with transcript data.
 */
function substituteVariables(
  promptTemplate: string,
  transcript: typeof transcripts.$inferSelect
): string {
  const speakerData = transcript.speakerDiarization
    ? JSON.parse(transcript.speakerDiarization)
    : [];
  const speakerNames =
    Array.isArray(speakerData) && speakerData.length > 0
      ? speakerData
          .map(
            (s: { speaker?: string; label?: string }) =>
              s.speaker || s.label || "Unknown"
          )
          .filter(
            (v: string, i: number, a: string[]) => a.indexOf(v) === i
          )
          .join(", ")
      : "Unknown speakers";

  const durationStr = transcript.duration
    ? `${Math.floor(transcript.duration / 60)}m ${transcript.duration % 60}s`
    : "Unknown";

  const dateStr = transcript.createdAt
    ? new Date(transcript.createdAt).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown date";

  return promptTemplate
    .replace(/\{\{transcript\}\}/g, transcript.transcriptionText || "")
    .replace(/\{\{speakers\}\}/g, speakerNames)
    .replace(/\{\{duration\}\}/g, durationStr)
    .replace(/\{\{date\}\}/g, dateStr)
    .replace(
      /\{\{topic\}\}/g,
      transcript.originalFilename || "General conversation"
    );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: transcriptId } = await params;
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    // Get transcript
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

    if (
      transcript.status !== "completed" ||
      !transcript.transcriptionText
    ) {
      return NextResponse.json(
        { error: "Transcript must be completed before processing" },
        { status: 400 }
      );
    }

    // Get template
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

    // Build prompt
    const processedPrompt = substituteVariables(
      template.promptTemplate,
      transcript
    );

    // Call Groq API
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    const startTime = Date.now();

    const aiResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are an expert transcript processor. Process the transcript according to the template instructions.",
            },
            { role: "user", content: processedPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      }
    );

    const processingTimeMs = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      return NextResponse.json(
        { error: "AI processing failed" },
        { status: 500 }
      );
    }

    const aiResult = await aiResponse.json();
    const outputText =
      aiResult.choices?.[0]?.message?.content || "No output generated.";
    const tokensUsed = aiResult.usage?.total_tokens ?? null;
    const modelUsed = aiResult.model || "llama-3.1-70b-versatile";

    // Store result
    const outputId = uuidv4();
    const [output] = await db
      .insert(processedOutputs)
      .values({
        id: outputId,
        transcriptId,
        templateId,
        userId,
        outputText,
        modelUsed,
        tokensUsed,
        processingTimeMs,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json({
      output: {
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
    });
  } catch (error) {
    console.error("Process error:", error);
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
    const { id: transcriptId } = await params;
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    return NextResponse.json({ outputs });
  } catch (error) {
    console.error("Get outputs error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
