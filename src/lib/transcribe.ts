import { execSync, exec as execCallback } from "child_process";
import { existsSync, mkdirSync, unlinkSync, readFileSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// whisper.cpp CLI config
const WHISPER_CLI = process.env.WHISPER_CLI || "/opt/whisper.cpp/build/bin/whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "/opt/whisper.cpp/models/ggml-base.en.bin";
const WHISPER_THREADS = process.env.WHISPER_THREADS || "4";

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
  speakers?: SpeakerSegment[];
}

interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Convert audio file to 16kHz mono WAV for whisper.cpp.
 */
function convertToWav(inputPath: string, outputPath: string): void {
  execSync(
    `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" 2>/dev/null`
  );
}

/**
 * Parse whisper.cpp SRT output into segments.
 */
function parseSrt(srtContent: string): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  const blocks = srtContent.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    // Parse timestamp line: "00:00:00,000 --> 00:00:05,000"
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!timeMatch) continue;

    const start =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const end =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join(" ").trim();
    if (text) {
      segments.push({ start, end, text });
    }
  }

  return segments;
}

/**
 * Transcribe an audio file using local whisper.cpp.
 */
export async function transcribeFile(
  filePath: string
): Promise<TranscriptionResult> {
  if (!existsSync(WHISPER_CLI)) {
    throw new Error(
      `whisper.cpp CLI not found at ${WHISPER_CLI}. Install whisper.cpp first.`
    );
  }

  if (!existsSync(WHISPER_MODEL)) {
    throw new Error(
      `Whisper model not found at ${WHISPER_MODEL}. Download a model first.`
    );
  }

  const tmpDir = path.join(process.cwd(), "data", "tmp_whisper");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const jobId = uuidv4();
  const wavPath = path.join(tmpDir, `${jobId}.wav`);
  const srtPath = path.join(tmpDir, `${jobId}.srt`);

  try {
    // Convert to WAV (16kHz mono)
    convertToWav(filePath, wavPath);

    // Get duration
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wavPath}"`,
      { encoding: "utf-8" }
    ).trim();
    const duration = parseFloat(durationStr);

    // Run whisper.cpp
    const whisperCmd = [
      `"${WHISPER_CLI}"`,
      `-m "${WHISPER_MODEL}"`,
      `-t ${WHISPER_THREADS}`,
      `--output-srt`,
      `-of "${path.join(tmpDir, jobId)}"`,
      `-f "${wavPath}"`,
    ].join(" ");

    await new Promise<void>((resolve, reject) => {
      const timeoutMs = Math.max(duration * 2000, 120000); // 2x realtime or 2 min min
      const proc = execCallback(whisperCmd, { timeout: timeoutMs }, (error) => {
        if (error) {
          reject(new Error(`whisper.cpp failed: ${error.message}`));
        } else {
          resolve();
        }
      });
      proc.stderr?.on("data", () => {}); // Drain stderr
    });

    // Parse SRT output
    if (!existsSync(srtPath)) {
      throw new Error("whisper.cpp did not produce SRT output");
    }

    const srtContent = readFileSync(srtPath, "utf-8");
    const segments = parseSrt(srtContent);
    const fullText = segments.map((s) => s.text).join(" ");

    // Simple speaker diarization
    const speakers = detectSpeakers(segments);

    return {
      text: fullText,
      language: "en",
      duration,
      segments,
      speakers,
    };
  } finally {
    // Clean up temp files
    for (const f of [wavPath, srtPath]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Simple speaker diarization based on pause detection.
 * Groups sequential segments by detected speaker changes.
 *
 * Heuristic: Long pauses (>2s) between segments suggest speaker change.
 */
function detectSpeakers(segments: WhisperSegment[]): SpeakerSegment[] {
  if (!segments.length) return [];

  const speakerSegments: SpeakerSegment[] = [];
  let currentSpeaker = "Speaker 1";
  let speakerCount = 1;
  let currentStart = segments[0].start;
  let currentText = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevSeg = i > 0 ? segments[i - 1] : null;

    let speakerChanged = false;

    if (prevSeg) {
      const pauseDuration = seg.start - prevSeg.end;
      if (pauseDuration > 2.0) {
        speakerChanged = true;
      }
    }

    if (speakerChanged) {
      speakerSegments.push({
        speaker: currentSpeaker,
        start: currentStart,
        end: prevSeg!.end,
        text: currentText.trim(),
      });

      speakerCount = Math.min(speakerCount + 1, 6);
      currentSpeaker = `Speaker ${(speakerSegments.length % speakerCount) + 1}`;
      currentStart = seg.start;
      currentText = seg.text;
    } else {
      currentText += " " + seg.text;
    }
  }

  if (currentText.trim()) {
    speakerSegments.push({
      speaker: currentSpeaker,
      start: currentStart,
      end: segments[segments.length - 1].end,
      text: currentText.trim(),
    });
  }

  return speakerSegments;
}
