import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processedOutputs, transcripts, templates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/webhook — Get recent processed outputs for webhook consumers.
 *
 * Query params:
 *   - since: ISO timestamp — return outputs created after this time
 *   - limit: number — max results (default 10, max 100)
 *   - template: string — filter by template name (partial match)
 *
 * Auth: Uses WEBHOOK_SECRET env var as bearer token.
 * This allows external services (like OpenClaw) to poll for new outputs.
 */
export async function GET(request: NextRequest) {
  // Auth via webhook secret
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook not configured (WEBHOOK_SECRET not set)" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json(
      { error: "Invalid webhook secret" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const limitStr = searchParams.get("limit");
  const templateFilter = searchParams.get("template");
  const limit = Math.min(Math.max(parseInt(limitStr || "10", 10), 1), 100);

  try {
    // Build query
    let results = await db
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
        originalFilename: transcripts.originalFilename,
        transcriptDuration: transcripts.duration,
      })
      .from(processedOutputs)
      .leftJoin(templates, eq(processedOutputs.templateId, templates.id))
      .leftJoin(
        transcripts,
        eq(processedOutputs.transcriptId, transcripts.id)
      )
      .orderBy(desc(processedOutputs.createdAt))
      .limit(limit);

    // Filter by since
    if (since) {
      results = results.filter(
        (r) => r.createdAt && new Date(r.createdAt) > new Date(since)
      );
    }

    // Filter by template name
    if (templateFilter) {
      const lower = templateFilter.toLowerCase();
      results = results.filter(
        (r) => r.templateName?.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({
      outputs: results,
      count: results.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Webhook query error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
