import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
};

// Also check by extension since some clients don't send correct MIME types
const ALLOWED_EXTENSIONS = [".m4a", ".mp3", ".wav", ".webm", ".ogg", ".flac"];

export interface UploadResult {
  storedFilename: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
}

export function isAllowedFile(
  filename: string,
  mimeType: string
): { allowed: boolean; reason?: string } {
  const ext = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES[mimeType]) {
    return {
      allowed: false,
      reason: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  return { allowed: true };
}

export async function saveUploadedFile(
  file: File,
  originalFilename: string
): Promise<UploadResult> {
  // Ensure upload directory exists
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const ext = path.extname(originalFilename).toLowerCase() || ".m4a";
  const storedFilename = `${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storedFilename);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  await writeFile(filePath, buffer);

  return {
    storedFilename,
    filePath,
    mimeType: file.type || "audio/mp4",
    fileSize: buffer.length,
  };
}
