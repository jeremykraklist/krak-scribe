import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, transcripts, templates } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get counts for dashboard stats
    const [transcriptCount] = await db
      .select({ count: count() })
      .from(transcripts)
      .where(eq(transcripts.userId, userId));

    const [templateCount] = await db
      .select({ count: count() })
      .from(templates)
      .where(eq(templates.userId, userId));

    return NextResponse.json({
      user,
      stats: {
        transcripts: transcriptCount?.count || 0,
        templates: templateCount?.count || 0,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
