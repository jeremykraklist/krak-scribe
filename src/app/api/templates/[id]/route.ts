import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";

/**
 * GET /api/templates/[id] — Get a single template.
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

    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)))
      .limit(1);

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      model: template.model,
      isDefault: template.isDefault,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (error) {
    console.error("Get template error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/templates/[id] — Update an existing template.
 */
export async function PUT(
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

    // Verify ownership
    const [existing] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
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

    const { name, description, systemPrompt, userPromptTemplate, model, isDefault } =
      (body ?? {}) as Record<string, unknown>;

    // Build update payload — only include provided fields
    const updates: Record<string, unknown> = {};

    // Check if any updatable field was actually provided
    const updatableKeys = ["name", "description", "systemPrompt", "userPromptTemplate", "model", "isDefault"];
    const hasUpdates = updatableKeys.some((k) => (body as Record<string, unknown>)[k] !== undefined);
    if (!hasUpdates) {
      return NextResponse.json(
        { error: "No updatable fields provided. Accepted: name, description, systemPrompt, userPromptTemplate, model, isDefault" },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date().toISOString();

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return NextResponse.json(
          { error: "description must be a string when provided" },
          { status: 400 }
        );
      }
      updates.description = typeof description === "string" ? description.trim() || null : null;
    }

    if (systemPrompt !== undefined) {
      if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
        return NextResponse.json(
          { error: "systemPrompt must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.systemPrompt = systemPrompt.trim();
    }

    if (userPromptTemplate !== undefined) {
      if (
        typeof userPromptTemplate !== "string" ||
        userPromptTemplate.trim().length === 0
      ) {
        return NextResponse.json(
          { error: "userPromptTemplate must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.userPromptTemplate = userPromptTemplate.trim();
    }

    if (model !== undefined) {
      if (model !== null && typeof model !== "string") {
        return NextResponse.json(
          { error: "model must be a string when provided" },
          { status: 400 }
        );
      }
      updates.model = typeof model === "string" ? model.trim() || "x-ai/grok-4.1-fast" : "x-ai/grok-4.1-fast";
    }

    if (isDefault !== undefined) {
      if (typeof isDefault !== "boolean") {
        return NextResponse.json(
          { error: "isDefault must be a boolean" },
          { status: 400 }
        );
      }

      // Clear other defaults for this user before setting a new one
      if (isDefault) {
        await db
          .update(templates)
          .set({ isDefault: false, updatedAt: new Date().toISOString() })
          .where(and(eq(templates.userId, userId), ne(templates.id, id)));
      }

      updates.isDefault = isDefault;
    }

    const [updated] = await db
      .update(templates)
      .set(updates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)))
      .returning();

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      systemPrompt: updated.systemPrompt,
      userPromptTemplate: updated.userPromptTemplate,
      model: updated.model,
      isDefault: updated.isDefault,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[id] — Delete a template.
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

    // Verify ownership
    const [existing] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    await db
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)));

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    if (
      error instanceof Error &&
      /FOREIGN KEY constraint failed/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error:
            "Template is in use by processed outputs and cannot be deleted.",
        },
        { status: 409 }
      );
    }
    console.error("Delete template error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
