import { readFile, stat } from "fs/promises";
import { execSync } from "child_process";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB (leave buffer under 25MB limit)
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk
const OVERLAP_SECONDS = 5; // 5 second overlap for stitching

interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface GroqTranscriptionResponse {
  text: string;
  task: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  words?: WordTimestamp[];
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  words?: WordTimestamp[];
  speakers?: SpeakerSegment[];
}

interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Transcribe an audio file using Groq Whisper API.
 * Handles chunking for files > 25MB.
 */
export async function transcribeFile(
  filePath: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }

  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;

  if (fileSize <= MAX_CHUNK_SIZE) {
    // Small enough to send directly
    const result = await transcribeChunk(filePath, apiKey);
    const speakers = detectSpeakers(result.segments);
    return { ...result, speakers };
  }

  // Large file — chunk it
  return await transcribeLargeFile(filePath, fileSize, apiKey);
}

/**
 * Transcribe a single chunk via Groq API.
 */
async function transcribeChunk(
  filePath: string,
  apiKey: string,
  language?: string
): Promise<GroqTranscriptionResponse> {
  const fileBuffer = await readFile(filePath);
  const filename = path.basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);
  formData.append("model", GROQ_MODEL);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");
  formData.append("timestamp_granularities[]", "word");

  if (language) {
    formData.append("language", language);
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq API error (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as GroqTranscriptionResponse;
}

/**
 * Handle large files by splitting into chunks with ffmpeg.
 */
async function transcribeLargeFile(
  filePath: string,
  fileSize: number,
  apiKey: string
): Promise<TranscriptionResult> {
  const tmpDir = path.join(process.cwd(), "data", "tmp_chunks");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const chunkId = uuidv4();
  const chunks: string[] = [];

  try {
    // Get duration with ffprobe
    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    ).trim();
    const totalDuration = parseFloat(durationStr);

    // Split into chunks
    let startTime = 0;
    let chunkIndex = 0;

    while (startTime < totalDuration) {
      const chunkPath = path.join(tmpDir, `${chunkId}_${chunkIndex}.flac`);
      const duration = Math.min(
        CHUNK_DURATION_SECONDS + OVERLAP_SECONDS,
        totalDuration - startTime
      );

      execSync(
        `ffmpeg -y -i "${filePath}" -ss ${startTime} -t ${duration} -ar 16000 -ac 1 -c:a flac "${chunkPath}" 2>/dev/null`
      );

      chunks.push(chunkPath);
      startTime += CHUNK_DURATION_SECONDS; // Move forward without overlap
      chunkIndex++;
    }

    // Transcribe each chunk
    let fullText = "";
    const allSegments: TranscriptionSegment[] = [];
    const allWords: WordTimestamp[] = [];
    let detectedLanguage = "";
    let timeOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await transcribeChunk(chunks[i], apiKey);

      if (i === 0) {
        detectedLanguage = chunkResult.language;
      }

      // Adjust timestamps by offset
      const adjustedSegments = chunkResult.segments.map((seg, idx) => ({
        ...seg,
        id: allSegments.length + idx,
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
      }));

      const adjustedWords = (chunkResult.words || []).map((w) => ({
        ...w,
        start: w.start + timeOffset,
        end: w.end + timeOffset,
      }));

      // Handle overlap — skip segments that overlap with previous chunk
      if (i > 0 && adjustedSegments.length > 0) {
        const overlapThreshold = timeOffset + OVERLAP_SECONDS * 0.5;
        const nonOverlapping = adjustedSegments.filter(
          (seg) => seg.start >= overlapThreshold
        );
        allSegments.push(...nonOverlapping);
        fullText +=
          " " + nonOverlapping.map((s) => s.text).join(" ");

        const nonOverlappingWords = adjustedWords.filter(
          (w) => w.start >= overlapThreshold
        );
        allWords.push(...nonOverlappingWords);
      } else {
        allSegments.push(...adjustedSegments);
        fullText += chunkResult.text;
        allWords.push(...adjustedWords);
      }

      timeOffset += CHUNK_DURATION_SECONDS;
    }

    const speakers = detectSpeakers(allSegments);

    return {
      text: fullText.trim(),
      language: detectedLanguage,
      duration: totalDuration,
      segments: allSegments,
      words: allWords,
      speakers,
    };
  } finally {
    // Clean up temp chunks
    for (const chunk of chunks) {
      try {
        unlinkSync(chunk);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Simple speaker diarization based on pause detection and segment analysis.
 * Groups sequential segments by detected speaker changes.
 *
 * Note: Groq's Whisper API doesn't provide native diarization.
 * This uses heuristic-based speaker detection:
 * - Long pauses (>2s) between segments suggest speaker change
 * - Changes in average log probability suggest different speakers
 */
function detectSpeakers(segments: TranscriptionSegment[]): SpeakerSegment[] {
  if (!segments.length) return [];

  const speakerSegments: SpeakerSegment[] = [];
  let currentSpeaker = "Speaker 1";
  let speakerCount = 1;
  let currentStart = segments[0].start;
  let currentText = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevSeg = i > 0 ? segments[i - 1] : null;

    // Detect speaker change heuristic:
    // 1. Long pause (>2 seconds) between segments
    // 2. Significant change in audio characteristics (avg_logprob)
    let speakerChanged = false;

    if (prevSeg) {
      const pauseDuration = seg.start - prevSeg.end;
      const logprobDiff = Math.abs(seg.avg_logprob - prevSeg.avg_logprob);

      if (pauseDuration > 2.0 || (pauseDuration > 1.0 && logprobDiff > 0.3)) {
        speakerChanged = true;
      }
    }

    if (speakerChanged) {
      // Save current speaker segment
      speakerSegments.push({
        speaker: currentSpeaker,
        start: currentStart,
        end: prevSeg!.end,
        text: currentText.trim(),
      });

      // Switch speaker (toggle between known speakers, max 6)
      speakerCount = Math.min(speakerCount + 1, 6);
      currentSpeaker = `Speaker ${((speakerSegments.length) % speakerCount) + 1}`;
      currentStart = seg.start;
      currentText = seg.text;
    } else {
      currentText += " " + seg.text;
    }
  }

  // Add final segment
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
