/**
 * Plaud API Client — reverse-engineered from web.plaud.ai
 *
 * Auth: Bearer JWT token (stored in PLAUD_TOKEN env var, ~300-day expiry)
 * Endpoints:
 *   - List files: GET /file/simple/web?skip=0&limit=99999&is_trash=2&sort_by=start_time&is_desc=true
 *   - Download audio: GET /file/download/{file_id} → raw MP3
 *   - File detail: GET /file/detail/{file_id} → transcript + summary presigned URLs
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const PLAUD_API_BASE = "https://api.plaud.ai";
const FETCH_TIMEOUT_MS = 120_000; // 2 min for large audio downloads

export interface PlaudFile {
  id: string;
  filename: string;
  fullname?: string;
  duration: number; // milliseconds
  start_time: number;
  filetype: number;
  filesize: number;
  is_trans: number;
  is_summary: number;
  scene?: number;
}

export interface PlaudListResponse {
  status: number;
  data_file_list: PlaudFile[];
  data_file_total: number;
}

function getToken(): string {
  const token = process.env.PLAUD_TOKEN;
  if (!token) {
    throw new Error(
      "PLAUD_TOKEN environment variable is not set. Add it to .env"
    );
  }
  // Ensure it has the "bearer " prefix
  return token.startsWith("bearer ") ? token : `bearer ${token}`;
}

/**
 * List all recordings from the Plaud account.
 */
export async function listRecordings(): Promise<PlaudFile[]> {
  const token = getToken();

  const url = `${PLAUD_API_BASE}/file/simple/web?skip=0&limit=99999&is_trash=2&sort_by=start_time&is_desc=true`;

  const response = await fetch(url, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Plaud API error (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as PlaudListResponse;

  if (data.status !== 0) {
    throw new Error(`Plaud API returned status ${data.status}`);
  }

  return data.data_file_list || [];
}

/**
 * Get a presigned S3 URL for a recording's audio file.
 * Uses /file/temp-url/{id}?is_opus=1 which returns both MP3 and Opus URLs.
 */
async function getTempUrl(fileId: string): Promise<string> {
  const token = getToken();

  const url = `${PLAUD_API_BASE}/file/temp-url/${fileId}?is_opus=1`;

  const response = await fetch(url, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Plaud temp-url error (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as {
    status: number;
    temp_url: string;
    temp_url_opus?: string;
  };

  if (data.status !== 0 || !data.temp_url) {
    throw new Error(`Plaud temp-url failed: status ${data.status}`);
  }

  // Prefer MP3 URL (temp_url), fall back to opus
  return data.temp_url;
}

/**
 * Download a recording's audio file (MP3) to disk.
 * Uses presigned S3 URLs from /file/temp-url endpoint.
 * Returns the path where the file was saved.
 */
export async function downloadAudio(
  fileId: string,
  outputDir: string,
  filename?: string
): Promise<{ filePath: string; fileSize: number }> {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Get presigned S3 URL for the actual MP3 audio
  const audioUrl = await getTempUrl(fileId);

  // Download the MP3 from S3
  const response = await fetch(audioUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Plaud audio download error (${response.status})`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeName = (filename || fileId)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
  const outputFilename = `plaud_${safeName}.mp3`;
  const filePath = path.join(outputDir, outputFilename);

  await writeFile(filePath, buffer);

  return { filePath, fileSize: buffer.length };
}

/**
 * Check if the Plaud token is valid by making a lightweight API call.
 */
export async function checkConnection(): Promise<{
  connected: boolean;
  fileCount?: number;
  error?: string;
}> {
  try {
    const token = getToken();

    const url = `${PLAUD_API_BASE}/file/simple/web?skip=0&limit=1&is_trash=2&sort_by=start_time&is_desc=true`;

    const response = await fetch(url, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { connected: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as PlaudListResponse;

    if (data.status !== 0) {
      return { connected: false, error: `API status ${data.status}` };
    }

    return {
      connected: true,
      fileCount: data.data_file_total,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
