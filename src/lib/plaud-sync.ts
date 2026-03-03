/**
 * Plaud Cloud Sync — reverse-engineered from web.plaud.ai
 *
 * Auth flow:
 *   Plaud uses OAuth (Google/Apple) or email+password login.
 *   After login, the web app stores "tokenstr" in localStorage
 *   as "Bearer <access_token>". All API calls use this as the
 *   Authorization header.
 *
 * For KrakScribe sync, the user provides their Plaud session token
 * (copied from browser localStorage after logging in at web.plaud.ai).
 *
 * API base: https://api.plaud.ai
 *
 * Key endpoints discovered:
 *   GET  /file/simple/web            — list files (recordings)
 *   GET  /file/detail/{id}           — file metadata + transcript
 *   GET  /file/temp-url/{id}         — temporary S3 download URL
 *   GET  /user/public/me             — verify token / get user info
 *   GET  /config/init                — app config
 */

import { existsSync, mkdirSync, createWriteStream } from "fs";
import { stat, unlink } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { db } from "./db";
import { transcripts, plaudSyncState } from "./db/schema";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "./crypto";

const PLAUD_API_BASE = "https://api.plaud.ai";
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const FETCH_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 120_000;

// ─── Types ───────────────────────────────────────────────────────────

export interface PlaudFile {
  id: string;
  filename: string;
  duration: number; // seconds
  file_size: number;
  create_time: string;
  update_time: string;
  is_trash: boolean;
  status: number;
  filetag_id_list?: string[];
  file_version?: number;
  has_transcript?: boolean;
}

export interface PlaudFileDetail {
  id: string;
  filename: string;
  duration: number;
  file_size: number;
  create_time: string;
  data_file: PlaudFile;
  data_transcript?: {
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
    text?: string;
  };
  data_summary?: {
    content?: string;
  };
}

export interface PlaudUser {
  id: string;
  email: string;
  nickname: string;
}

export interface SyncResult {
  success: boolean;
  filesFound: number;
  filesDownloaded: number;
  filesSkipped: number;
  errors: string[];
}

// ─── API Client ──────────────────────────────────────────────────────

async function plaudFetch(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${PLAUD_API_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.method === "GET" ? FETCH_TIMEOUT : FETCH_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Verify token is valid by calling /user/public/me
 */
export async function verifyPlaudToken(
  token: string
): Promise<PlaudUser | null> {
  try {
    const res = await plaudFetch("/user/public/me", token);
    if (!res.ok) return null;
    const data = await res.json();
    // The endpoint returns user data directly or nested
    return data.id
      ? (data as PlaudUser)
      : data.data_user
        ? (data.data_user as PlaudUser)
        : null;
  } catch {
    return null;
  }
}

/**
 * List recordings from Plaud cloud.
 * Returns array of file objects sorted by create_time desc.
 */
export async function listPlaudFiles(
  token: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PlaudFile[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("page_size", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const queryStr = params.toString();
  const endpoint = `/file/simple/web${queryStr ? `?${queryStr}` : ""}`;

  const res = await plaudFetch(endpoint, token);
  if (!res.ok) {
    throw new Error(`Plaud API error listing files: ${res.status}`);
  }

  const data = await res.json();
  const files: PlaudFile[] = data.data_file_list || data.data || [];

  // Filter out trashed files and return newest first
  return files
    .filter((f) => !f.is_trash)
    .sort((a, b) => {
      const timeA = Date.parse(a.create_time || "");
      const timeB = Date.parse(b.create_time || "");
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    });
}

/**
 * Get detailed info for a single file, including transcript if available.
 */
export async function getPlaudFileDetail(
  fileId: string,
  token: string
): Promise<PlaudFileDetail | null> {
  try {
    const res = await plaudFetch(`/file/detail/${fileId}`, token);
    if (!res.ok) return null;
    return (await res.json()) as PlaudFileDetail;
  } catch {
    return null;
  }
}

/**
 * Get a temporary download URL for the audio file.
 * Plaud stores audio on S3 and returns a pre-signed URL.
 */
export async function getPlaudAudioUrl(
  fileId: string,
  token: string
): Promise<string | null> {
  try {
    const res = await plaudFetch(`/file/temp-url/${fileId}`, token);
    if (!res.ok) return null;
    const data = await res.json();
    // Response contains the temporary URL - could be nested
    return (
      data.url || data.temp_url || data.data?.url || data.data?.temp_url || null
    );
  } catch {
    return null;
  }
}

/**
 * Download audio file from Plaud's temporary S3 URL to local storage.
 */
async function downloadAudioFile(
  downloadUrl: string,
  filename: string
): Promise<{ storedFilename: string; filePath: string; fileSize: number }> {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const ext = path.extname(filename).toLowerCase() || ".m4a";
  const storedFilename = `plaud-${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storedFilename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  try {
    const res = await fetch(downloadUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status}`);
    }
    if (!res.body) {
      throw new Error("Response body is null — cannot stream download");
    }

    // Stream to disk instead of buffering entire file in memory (prevents OOM on long recordings)
    const readable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    const writable = createWriteStream(filePath);
    await pipeline(readable, writable);

    const fileStat = await stat(filePath);

    return {
      storedFilename,
      filePath,
      fileSize: fileStat.size,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Sync Logic ──────────────────────────────────────────────────────

/**
 * Get sync state for a user.
 */
export function getSyncState(userId: string) {
  const [state] = db
    .select()
    .from(plaudSyncState)
    .where(eq(plaudSyncState.userId, userId))
    .limit(1)
    .all();
  return state || null;
}

const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check if a sync lock is stale (updatedAt older than STALE_LOCK_MS).
 */
function isLockStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  return elapsed > STALE_LOCK_MS;
}

/**
 * Atomically claim sync lock for a user using compare-and-set.
 * Returns true if the claim succeeded (status was NOT 'syncing' and is now 'syncing').
 * Returns false if another sync is already in progress.
 *
 * Handles:
 *   - First-time insert race (UNIQUE constraint catch + re-read)
 *   - Stale lock reclamation (if syncing but updatedAt > 10 min old)
 */
export function claimSyncLock(userId: string): boolean {
  const existing = getSyncState(userId);
  const now = new Date().toISOString();

  if (!existing) {
    // No state row yet — create one in 'syncing' status.
    // Wrap in try/catch: concurrent first-time claims can collide on UNIQUE constraint.
    try {
      db.insert(plaudSyncState)
        .values({
          id: uuidv4(),
          userId,
          plaudToken: "",
          plaudEmail: null,
          lastSyncAt: null,
          lastSyncFileCount: 0,
          lastSyncError: null,
          syncStatus: "syncing",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("UNIQUE constraint failed")) {
        // Another process inserted first — re-read and attempt CAS update
        const reread = getSyncState(userId);
        if (!reread) return false;
        if (reread.syncStatus === "syncing") {
          // Only reclaim if the lock is stale
          if (isLockStale(reread.updatedAt)) {
            const result = db
              .update(plaudSyncState)
              .set({ syncStatus: "syncing", updatedAt: now })
              .where(eq(plaudSyncState.userId, userId))
              .run();
            return result.changes > 0;
          }
          return false;
        }
        // CAS update on the re-read state
        const result = db
          .update(plaudSyncState)
          .set({ syncStatus: "syncing", updatedAt: now })
          .where(
            and(
              eq(plaudSyncState.userId, userId),
              eq(plaudSyncState.syncStatus, reread.syncStatus)
            )
          )
          .run();
        return result.changes > 0;
      }
      throw err;
    }
  }

  if (existing.syncStatus === "syncing") {
    // Check for stale lock (older than 10 minutes) — allows recovery from crashed syncs
    if (isLockStale(existing.updatedAt)) {
      const result = db
        .update(plaudSyncState)
        .set({ syncStatus: "syncing", updatedAt: now })
        .where(eq(plaudSyncState.userId, userId))
        .run();
      return result.changes > 0;
    }
    return false;
  }

  // Atomic CAS: only update if syncStatus hasn't changed to 'syncing' since our read.
  // SQLite serializes writes, so this WHERE condition acts as a compare-and-set.
  const result = db
    .update(plaudSyncState)
    .set({ syncStatus: "syncing", updatedAt: now })
    .where(
      and(
        eq(plaudSyncState.userId, userId),
        // Only claim if NOT already syncing (CAS guard)
        eq(plaudSyncState.syncStatus, existing.syncStatus)
      )
    )
    .run();

  return result.changes > 0;
}

/**
 * Update sync state after a sync run.
 */
type SyncStatusEnum = "idle" | "syncing" | "error" | "disconnected";

function updateSyncState(
  userId: string,
  updates: {
    lastSyncAt?: string;
    lastSyncFileCount?: number;
    lastSyncError?: string | null;
    plaudEmail?: string;
    syncStatus?: SyncStatusEnum;
  }
) {
  const existing = getSyncState(userId);
  const now = new Date().toISOString();

  if (existing) {
    db.update(plaudSyncState)
      .set({ ...updates, updatedAt: now })
      .where(eq(plaudSyncState.userId, userId))
      .run();
  } else {
    db.insert(plaudSyncState)
      .values({
        id: uuidv4(),
        userId,
        plaudToken: "",
        plaudEmail: updates.plaudEmail || null,
        lastSyncAt: updates.lastSyncAt || null,
        lastSyncFileCount: updates.lastSyncFileCount || 0,
        lastSyncError: updates.lastSyncError || null,
        syncStatus: updates.syncStatus || "idle",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/**
 * Save/update the Plaud token for a user.
 */
export function savePlaudToken(userId: string, token: string) {
  const existing = getSyncState(userId);
  const now = new Date().toISOString();

  // Normalize token format
  const normalizedToken = token.startsWith("Bearer ")
    ? token
    : `Bearer ${token}`;

  // Encrypt token before persisting to database
  const encryptedToken = encryptToken(normalizedToken);

  if (existing) {
    db.update(plaudSyncState)
      .set({ plaudToken: encryptedToken, updatedAt: now })
      .where(eq(plaudSyncState.userId, userId))
      .run();
  } else {
    db.insert(plaudSyncState)
      .values({
        id: uuidv4(),
        userId,
        plaudToken: encryptedToken,
        plaudEmail: null,
        lastSyncAt: null,
        lastSyncFileCount: 0,
        lastSyncError: null,
        syncStatus: "idle",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/**
 * Get the stored Plaud token for a user.
 */
export function getPlaudToken(userId: string): string | null {
  const state = getSyncState(userId);
  if (!state?.plaudToken) return null;
  // Decrypt token (handles both encrypted and legacy plaintext tokens)
  return decryptToken(state.plaudToken);
}

/**
 * Clear the Plaud token (disconnect).
 */
export function clearPlaudToken(userId: string) {
  const existing = getSyncState(userId);
  if (existing) {
    db.update(plaudSyncState)
      .set({
        plaudToken: "",
        syncStatus: "disconnected",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(plaudSyncState.userId, userId))
      .run();
  }
}

/**
 * Check if a Plaud file has already been synced (by plaud_file_id on transcripts).
 */
function isAlreadySynced(plaudFileId: string, userId: string): boolean {
  const [existing] = db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.userId, userId),
        eq(transcripts.plaudFileId, plaudFileId)
      )
    )
    .limit(1)
    .all();
  return !!existing;
}

/**
 * Main sync function: pull new recordings from Plaud Cloud.
 *
 * Flow:
 *   1. Verify token
 *   2. List files from Plaud
 *   3. For each new file (not already synced):
 *     a. Get download URL
 *     b. Download audio to data/uploads/
 *     c. Create transcript record in pending state
 *   4. Update sync state
 *
 * Returns summary of what was synced.
 */
export async function syncFromPlaud(
  userId: string,
  options: { limit?: number; autoTranscribe?: boolean } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesFound: 0,
    filesDownloaded: 0,
    filesSkipped: 0,
    errors: [],
  };

  // Get stored token
  const token = getPlaudToken(userId);
  if (!token) {
    result.errors.push("No Plaud token configured. Connect your Plaud account first.");
    updateSyncState(userId, {
      lastSyncError: "No token",
      syncStatus: "error",
    });
    return result;
  }

  // Note: Caller should use claimSyncLock() before calling syncFromPlaud()
  // to atomically set status to "syncing" and prevent races.

  try {
    // 1. Verify token
    const user = await verifyPlaudToken(token);
    if (!user) {
      result.errors.push(
        "Plaud token is invalid or expired. Please reconnect your account."
      );
      updateSyncState(userId, {
        lastSyncError: "Token expired",
        syncStatus: "error",
      });
      return result;
    }

    // 2. List files
    const files = await listPlaudFiles(token, {
      limit: options.limit || 50,
    });
    result.filesFound = files.length;

    // 3. Process each file
    for (const file of files) {
      try {
        // Skip if already synced
        if (isAlreadySynced(file.id, userId)) {
          result.filesSkipped++;
          continue;
        }

        // Get download URL
        const audioUrl = await getPlaudAudioUrl(file.id, token);
        if (!audioUrl) {
          result.errors.push(
            `Could not get download URL for "${file.filename}"`
          );
          continue;
        }

        // Determine file extension from filename
        const originalFilename = file.filename || `plaud-recording-${file.id}`;
        // Only append extension if the original filename doesn't have one
        const safeFilename = path.extname(originalFilename)
          ? originalFilename
          : `${originalFilename}.m4a`;

        // Download audio
        const downloaded = await downloadAudioFile(audioUrl, safeFilename);

        // Create transcript record (handle unique constraint for idempotency)
        const transcriptId = uuidv4();
        const now = new Date().toISOString();

        try {
          db.insert(transcripts)
            .values({
              id: transcriptId,
              userId,
              originalFilename: file.filename || `Plaud Recording ${file.id}`,
              storedFilename: downloaded.storedFilename,
              filePath: downloaded.filePath,
              mimeType: "audio/mp4",
              fileSize: downloaded.fileSize,
              duration: file.duration || null,
              status: "pending",
              plaudFileId: file.id,
              createdAt: file.create_time || now,
              updatedAt: now,
            })
            .run();

          result.filesDownloaded++;
        } catch (insertErr: unknown) {
          // If unique constraint violation, treat as already-synced (idempotent)
          const errMsg = insertErr instanceof Error ? insertErr.message : "";
          if (errMsg.includes("UNIQUE constraint failed")) {
            result.filesSkipped++;
          } else {
            // Clean up downloaded file to prevent disk leaks on unexpected insert failures
            try {
              await unlink(downloaded.filePath);
            } catch {
              // Ignore unlink errors (file may already be gone)
            }
            throw insertErr;
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error";
        result.errors.push(
          `Failed to sync "${file.filename}": ${msg}`
        );
      }
    }

    // 4. Update sync state
    const now = new Date().toISOString();
    updateSyncState(userId, {
      lastSyncAt: now,
      lastSyncFileCount: result.filesDownloaded,
      lastSyncError:
        result.errors.length > 0
          ? result.errors.join("; ")
          : null,
      plaudEmail: user.email || undefined,
      syncStatus: "idle",
    });

    result.success = true;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    result.errors.push(msg);
    updateSyncState(userId, {
      lastSyncError: msg,
      syncStatus: "error",
    });
    return result;
  }
}
