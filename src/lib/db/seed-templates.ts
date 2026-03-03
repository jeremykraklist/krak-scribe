import { db } from "./index";
import { templates } from "./schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface DefaultTemplate {
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Meeting Action Items",
    description:
      "Extract decisions, action items, follow-ups with owners and deadlines from a meeting transcript.",
    systemPrompt:
      "You are an expert executive assistant specializing in extracting structured meeting outcomes. Be precise, actionable, and thorough. Use markdown formatting.",
    userPromptTemplate: `Analyze this meeting transcript and extract all actionable information.

**Meeting Date:** {{date}}
**Duration:** {{duration}}
**Speakers:** {{speakers}}

## Transcript
{{transcript}}

---

Provide the following sections:

### 🎯 Key Decisions Made
List each decision with context.

### ✅ Action Items
For each action item provide:
- **Task:** What needs to be done
- **Owner:** Who is responsible (from speakers, or "Unassigned")
- **Deadline:** When it's due (if mentioned, otherwise "TBD")
- **Priority:** High / Medium / Low

### 📋 Follow-Ups
Items that need follow-up but aren't firm action items yet.

### ⚠️ Open Questions
Unresolved questions or topics that need further discussion.`,
  },
  {
    name: "Content Ideas",
    description:
      "Generate social media posts, blog topics, and video ideas from conversation content.",
    systemPrompt:
      "You are a creative content strategist who excels at repurposing conversations into engaging content across multiple platforms. Think like a marketer who understands virality, hooks, and audience engagement.",
    userPromptTemplate: `Extract content ideas from this conversation transcript.

**Topic:** {{topic}}
**Date:** {{date}}
**Speakers:** {{speakers}}

## Transcript
{{transcript}}

---

Generate content ideas organized by platform:

### 🐦 Twitter/X Posts (5-8 tweets)
Short, punchy, quotable. Include hooks and CTAs.

### 📸 Instagram/Carousel Ideas (3-5)
Visual content concepts with captions and hashtag suggestions.

### 📝 Blog Post Topics (3-5)
Full article ideas with title, angle, and key talking points.

### 🎬 Video/Reel Ideas (3-5)
Short-form video concepts with hooks and scripts.

### 💡 Bonus: Unexpected Angles
Any surprising or counterintuitive insights that could go viral.`,
  },
  {
    name: "Executive Summary",
    description:
      "Concise summary with key points, decisions, and next steps.",
    systemPrompt:
      "You are a senior executive who values brevity and clarity. Write summaries that a busy CEO can scan in 60 seconds and understand everything important. Use bullet points liberally.",
    userPromptTemplate: `Create an executive summary of this transcript.

**Date:** {{date}}
**Duration:** {{duration}}
**Speakers:** {{speakers}}
**Topic:** {{topic}}

## Transcript
{{transcript}}

---

### 📊 Executive Summary

**TL;DR** (2-3 sentences max):

**Key Points:**
- Bullet each major point discussed

**Decisions Made:**
- List final decisions with rationale

**Next Steps:**
- Action items with owners

**Timeline:**
- Key dates/milestones mentioned

**Risks/Concerns:**
- Any flagged issues or blockers`,
  },
  {
    name: "Journal Entry",
    description:
      "Organize thoughts into a structured personal journal format.",
    systemPrompt:
      "You are a thoughtful journaling assistant who helps organize stream-of-consciousness thoughts into reflective, structured journal entries. Maintain the speaker's authentic voice while adding structure and insight.",
    userPromptTemplate: `Transform this transcript into a structured journal entry.

**Date:** {{date}}
**Duration:** {{duration}}

## Transcript
{{transcript}}

---

### 📓 Journal Entry — {{date}}

**Today's Theme:**
(Identify the overarching theme or mood)

**What Happened:**
Narrative summary of events/thoughts discussed, written in first person.

**Key Insights:**
- Realizations and "aha" moments

**How I'm Feeling:**
Emotional state and energy level based on tone.

**Gratitude:**
Things to be thankful for mentioned or implied.

**Tomorrow's Focus:**
What to prioritize based on what was discussed.

**Notable Quotes:**
Direct quotes worth remembering from the conversation.`,
  },
];

/**
 * Seeds default templates for a given user if none exist yet.
 * better-sqlite3 transactions must be synchronous (no async/await).
 */
export function seedDefaultTemplates(userId: string): void {
  const existing = db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .limit(1)
    .all();

  if (existing.length > 0) return;

  const now = new Date().toISOString();
  db.insert(templates)
    .values(
      DEFAULT_TEMPLATES.map((tpl) => ({
        id: uuidv4(),
        userId,
        name: tpl.name,
        description: tpl.description,
        systemPrompt: tpl.systemPrompt,
        userPromptTemplate: tpl.userPromptTemplate,
        model: "x-ai/grok-4.1-fast",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }))
    )
    .run();
}
