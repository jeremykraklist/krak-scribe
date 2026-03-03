import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  syncFromPlaud,
  getSyncState,
  claimSyncLock,
  savePlaudToken,
  clearPlaudToken,
  verifyPlaudToken,
  getPlaudToken,
} from "@/lib/plaud-sync";

/**
 * GET /api/sync/plaud — Return sync status for the current user.
 */
export async function GET(request: Request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = getSyncState(userId);

  // Check if token is still valid (without exposing the actual token)
  let tokenValid = false;
  let plaudUser = null;
  const token = getPlaudToken(userId);
  if (token) {
    plaudUser = await verifyPlaudToken(token);
    tokenValid = !!plaudUser;
  }

  return NextResponse.json({
    connected: !!token && tokenValid,
    plaudEmail: state?.plaudEmail || plaudUser?.email || null,
    plaudNickname: plaudUser?.nickname || null,
    lastSyncAt: state?.lastSyncAt || null,
    lastSyncFileCount: state?.lastSyncFileCount || 0,
    lastSyncError: state?.lastSyncError || null,
    syncStatus: state?.syncStatus || "idle",
    tokenExpired: !!token && !tokenValid,
  });
}

/**
 * POST /api/sync/plaud — Trigger sync or manage connection.
 *
 * Body options:
 *   { action: "sync" }              — trigger a manual sync
 *   { action: "connect", token: "..." }  — save Plaud token
 *   { action: "disconnect" }        — remove Plaud token
 *   { action: "verify", token: "..." }   — verify a token without saving
 */
export async function POST(request: Request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; token?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const action = body.action || "sync";

  switch (action) {
    case "verify": {
      if (!body.token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }
      const user = await verifyPlaudToken(body.token);
      if (!user) {
        return NextResponse.json(
          { valid: false, error: "Token is invalid or expired" },
          { status: 200 }
        );
      }
      return NextResponse.json({
        valid: true,
        email: user.email,
        nickname: user.nickname,
      });
    }

    case "connect": {
      if (!body.token) {
        return NextResponse.json(
          { error: "Token is required" },
          { status: 400 }
        );
      }

      // Verify before saving
      const user = await verifyPlaudToken(body.token);
      if (!user) {
        return NextResponse.json(
          { error: "Token is invalid or expired. Please try again." },
          { status: 400 }
        );
      }

      savePlaudToken(userId, body.token);
      return NextResponse.json({
        success: true,
        email: user.email,
        nickname: user.nickname,
      });
    }

    case "disconnect": {
      clearPlaudToken(userId);
      return NextResponse.json({ success: true });
    }

    case "sync": {
      // Atomic claim: prevents concurrent sync races
      const claimed = claimSyncLock(userId);
      if (!claimed) {
        return NextResponse.json(
          { error: "Sync already in progress" },
          { status: 409 }
        );
      }

      // Validate and clamp limit (1–200, default 50)
      const parsedLimit = Number(body.limit);
      const limit =
        Number.isInteger(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 200)
          : 50;

      const result = await syncFromPlaud(userId, { limit });

      return NextResponse.json(result);
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
