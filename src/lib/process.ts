import type { Template, Transcript } from "./db/schema";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const FETCH_TIMEOUT_MS = 120_000; // 2 minutes — LLM calls can be slow on long transcripts

interface ProcessingResult {
  outputText: string;
  modelUsed: string;
  tokensUsed: number | null;
  processingTimeMs: number;
}

/**
 * Substitutes template variables with transcript data.
 * Supported variables: {{transcript}}, {{speakers}}, {{duration}}, {{date}}, {{topic}}
 */
function substituteVariables(
  promptTemplate: string,
  transcript: Transcript
): string {
  let speakerData: Array<{ speaker?: string; label?: string }> = [];
  if (transcript.speakerDiarization) {
    try {
      const parsed: unknown = JSON.parse(transcript.speakerDiarization);
      speakerData = Array.isArray(parsed)
        ? (parsed as Array<{ speaker?: string; label?: string }>)
        : [];
    } catch {
      speakerData = [];
    }
  }

  const speakerNames =
    speakerData.length > 0
      ? speakerData
          .map((s) => s.speaker || s.label || "Unknown")
          .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
          .join(", ")
      : "Unknown speakers";

  const durationMinutes = transcript.duration
    ? `${Math.floor(transcript.duration / 60)}m ${transcript.duration % 60}s`
    : "Unknown";

  const date = transcript.createdAt
    ? new Date(transcript.createdAt).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown date";

  // Extract topic from first ~30 words of transcript
  const transcriptText = transcript.transcriptionText || "";
  const topic =
    transcriptText.split(/\s+/).slice(0, 30).join(" ") +
    (transcriptText.split(/\s+/).length > 30 ? "..." : "");

  return promptTemplate
    .replace(/\{\{transcript\}\}/g, transcriptText)
    .replace(/\{\{speakers\}\}/g, speakerNames)
    .replace(/\{\{duration\}\}/g, durationMinutes)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{topic\}\}/g, topic || "General conversation");
}

/**
 * Process a transcript through an AI template via OpenRouter.
 */
export async function processTranscript(
  transcript: Transcript,
  template: Template
): Promise<ProcessingResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not set. Add it to .env"
    );
  }

  const userPrompt = substituteVariables(
    template.userPromptTemplate,
    transcript
  );

  const startTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://krak-scribe.app",
        "X-Title": "KrakScribe",
      },
      body: JSON.stringify({
        model: template.model || "x-ai/grok-4.1-fast",
        messages: [
          { role: "system", content: template.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `OpenRouter API request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const processingTimeMs = Date.now() - startTime;

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();

  const outputText =
    data.choices?.[0]?.message?.content || "No output generated.";
  const tokensUsed = data.usage?.total_tokens ?? null;

  return {
    outputText,
    modelUsed: template.model || "x-ai/grok-4.1-fast",
    tokensUsed,
    processingTimeMs,
  };
}
