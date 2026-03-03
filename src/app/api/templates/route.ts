import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, userId))
      .orderBy(desc(templates.createdAt));

    return NextResponse.json({ templates: results });
  } catch (error) {
    console.error("List templates error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, promptTemplate } = body;

    if (!name || !promptTemplate) {
      return NextResponse.json(
        { error: "Name and promptTemplate are required" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const [template] = await db
      .insert(templates)
      .values({
        id,
        userId,
        name,
        description: description || null,
        promptTemplate,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
