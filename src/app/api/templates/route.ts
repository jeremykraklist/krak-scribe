import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { seedDefaultTemplates } from "@/lib/db/seed-templates";

/**
 * GET /api/templates — List all templates for the authenticated user.
 * Seeds default templates on first request if user has none.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid Bearer token." },
        { status: 401 }
      );
    }

    // Seed defaults if user has no templates yet
    seedDefaultTemplates(userId);

    const userTemplates = db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId))
      .orderBy(desc(templates.isDefault), desc(templates.createdAt));

    return NextResponse.json({
      templates: userTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        systemPrompt: t.systemPrompt,
        userPromptTemplate: t.userPromptTemplate,
        model: t.model,
        isDefault: t.isDefault,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      count: userTemplates.length,
    });
  } catch (error) {
    console.error("List templates error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates — Create a new template.
 */
export async function POST(request: NextRequest) {
  try {
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

    const { name, description, systemPrompt, userPromptTemplate, model } =
      (body ?? {}) as Record<string, unknown>;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (
      !systemPrompt ||
      typeof systemPrompt !== "string" ||
      systemPrompt.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "systemPrompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (
      !userPromptTemplate ||
      typeof userPromptTemplate !== "string" ||
      userPromptTemplate.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "userPromptTemplate is required and must be a non-empty string",
        },
        { status: 400 }
      );
    }

    if (description !== undefined && description !== null && typeof description !== "string") {
      return NextResponse.json(
        { error: "description must be a string when provided" },
        { status: 400 }
      );
    }

    if (model !== undefined && model !== null && typeof model !== "string") {
      return NextResponse.json(
        { error: "model must be a string when provided" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const id = uuidv4();

    const [created] = await db
      .insert(templates)
      .values({
        id,
        userId,
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        systemPrompt: systemPrompt.trim(),
        userPromptTemplate: userPromptTemplate.trim(),
        model: typeof model === "string" ? model.trim() || "x-ai/grok-4.1-fast" : "x-ai/grok-4.1-fast",
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        description: created.description,
        systemPrompt: created.systemPrompt,
        userPromptTemplate: created.userPromptTemplate,
        model: created.model,
        isDefault: created.isDefault,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
