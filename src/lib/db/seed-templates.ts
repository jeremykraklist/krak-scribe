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
  {
    name: "Detailed Transcript Analysis",
    description:
      "Comprehensive extraction: summary, action items, key quotes, decisions, follow-ups, content ideas, sentiment analysis, and more.",
    systemPrompt:
      "You are an elite analyst who extracts maximum value from conversations. Leave nothing on the table. Every insight, every nuance, every implicit and explicit piece of information should be captured and organized. Use rich markdown formatting with emojis for scannability.",
    userPromptTemplate: `Perform a comprehensive analysis of this transcript. Extract EVERYTHING of value.

**Date:** {{date}}
**Duration:** {{duration}}
**Speakers:** {{speakers}}
**Topic:** {{topic}}

## Transcript
{{transcript}}

---

## 📊 Comprehensive Analysis

### 🔍 Overview
- **Summary** (3-5 sentences)
- **Context & Setting** (what prompted this conversation)
- **Overall Tone/Sentiment** (professional, casual, tense, excited, etc.)

### 🎯 Key Decisions
For each decision:
- What was decided
- Why (rationale/context)
- Who championed it
- Confidence level (definitive / tentative / exploratory)

### ✅ Action Items
| # | Task | Owner | Deadline | Priority | Status |
|---|------|-------|----------|----------|--------|
(Extract every commitment, promise, or "I'll do X")

### 💡 Key Insights & Ideas
- Novel ideas mentioned
- Strategic insights
- "Aha" moments
- Hypotheses proposed

### 📋 Follow-Up Items
- Questions that need answering
- Research to be done
- People to loop in
- Meetings to schedule

### 🗣️ Notable Quotes
Extract 5-10 direct quotes that capture the most important points, with speaker attribution.

### 📈 Metrics & Numbers
Any data points, statistics, dates, dollar amounts, or quantitative information mentioned.

### ⚠️ Risks & Concerns
- Potential problems identified
- Disagreements or tensions
- Resource constraints mentioned
- Dependencies flagged

### 🤝 Relationships & Dynamics
- Power dynamics observed
- Agreements and alignments
- Points of friction
- Who deferred to whom

### 🎬 Content Opportunities
- Quotable sound bites
- Stories worth sharing
- Lessons that could be taught
- Topics for future deep-dives

### 📝 Raw Notes
Any details that don't fit above categories but are worth preserving.`,
  },
  {
    name: "AI Agent Instructions",
    description:
      "Converts spoken ideas into structured, actionable prompts ready to paste into AI agents. Perfect for voice-to-agent delegation.",
    systemPrompt: `You are an expert prompt engineer who transforms raw human speech into crystal-clear, structured instructions for AI agents. Your job is to:

1. Extract the INTENT behind what the speaker is asking for
2. Fill in implied details and reasonable defaults
3. Structure it as a professional prompt/task spec
4. Include acceptance criteria so the agent knows when it's done
5. Flag any ambiguities that need clarification

The output should be IMMEDIATELY usable — paste into Claude, GPT, or any AI agent and get results. No editing needed.

Write in imperative/command form. Be specific. Include constraints and edge cases.`,
    userPromptTemplate: `Listen to what I said and convert it into one or more structured AI agent instructions.

**Date:** {{date}}
**Duration:** {{duration}}

## What I Said
{{transcript}}

---

## 🤖 Agent Instructions

For each distinct task or idea mentioned, create a structured instruction block:

### Task [N]: [Descriptive Title]

**Objective:** One clear sentence describing what the agent should accomplish.

**Context:** Background information the agent needs to understand WHY.

**Instructions:**
1. Step-by-step breakdown
2. Include specific details mentioned
3. Fill in reasonable defaults for anything left ambiguous
4. Note any constraints or preferences stated

**Acceptance Criteria:**
- [ ] Checklist of what "done" looks like
- [ ] Specific deliverables expected
- [ ] Quality requirements

**Technical Notes:**
- Stack/tools to use (if mentioned)
- APIs or services referenced
- File locations or repos mentioned

**Priority:** High / Medium / Low (inferred from tone and urgency)

**⚠️ Ambiguities to Resolve:**
- List anything unclear that the agent should ask about before proceeding

---

**💡 Meta-Notes:**
- Were multiple tasks mentioned? If so, suggest execution order.
- Any dependencies between tasks?
- Recommended agent/model for each task (if specific expertise needed).`,
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
