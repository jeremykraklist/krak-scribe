import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Test database connection
    const result = db.select({ count: sql<number>`count(*)` }).from(users).get();

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      database: {
        connected: true,
        userCount: result?.count ?? 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
