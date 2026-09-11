// ──────────────────────────────────────────────
// Automatic Background Memory Extractor
// Runs fire-and-forget after every assistant response
// Extracts durable facts with proactive time tags and commits them to memory
// ──────────────────────────────────────────────

import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { rememberFact } from '@/lib/tools/memory';

export interface ExtractedFact {
  key: string;
  value: string;
  topic?: string;
  follow_up_relevant?: boolean;
  inferred_date?: string | null;
}

/**
 * Lightweight extraction prompt to isolate durable operator facts & proactive temporal cues
 * without adding latency to the main conversational response.
 */
export async function extractAndStoreMemories(
  profileId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const cleanUser = userMessage?.trim();
  const cleanAssistant = assistantResponse?.trim();

  // Guard against trivial or empty exchanges
  if (!profileId || !cleanUser || cleanUser.length < 4) return;

  const extractionPrompt = `You are a memory extraction and relationship intelligence engine for J.A.R.V.I.S.
Your job is to extract durable, persistent facts about the user (the operator) from this conversational exchange that are worth remembering long-term.

Durable facts include:
- Ongoing projects, apps, ventures, or robotics (e.g. project name, tech stack, goals)
- Personal details, profession, job role, skills, interests
- Time-sensitive events/milestones (e.g. "presenting Friday", "demo tomorrow", "launch next week", "exam on Monday", "meeting with client")
- Explicit or implicit preferences (e.g. coding conventions, language choices, workflows)
- Names of collaborators, colleagues, pets, or significant entities mentioned

DO NOT extract:
- Casual chit-chat, greetings, or pleasantries ("hello", "how are you", "good morning")
- Ephemeral queries or one-off calculations ("what is the weather", "calculate 42*5")
- J.A.R.V.I.S's own capabilities, status, or system remarks
- Transient states ("I'm tired", "I will be back in 5 minutes")

Return STRICTLY a JSON array of objects with the following schema:
- "key": short, descriptive snake_case identifier (e.g. "project_nova_presentation", "preferred_language", "pet_dog")
- "value": clear, concise fact summary (e.g. "Nova project presentation on Friday", "Works in Rust", "Has a dog named Max")
- "topic": entity / subject name (e.g. "Nova", "Stark Suit", "Rust", "Presentation")
- "follow_up_relevant": boolean (true IF this fact is an upcoming event, deadline, presentation, test, demo, or meeting that warrants a proactive check-in; otherwise false)
- "inferred_date": string or null (e.g. "tomorrow", "Friday", "next week", "2026-09-11", or null if not time-sensitive)

If NO durable facts are found, return STRICTLY: []

Exchange to analyze:
Operator: "${cleanUser.replace(/"/g, '\\"')}"
J.A.R.V.I.S: "${cleanAssistant.replace(/"/g, '\\"')}"`;

  let responseText = '';

  // 1. Try Groq first for ultra-fast sub-second extraction
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.1,
        max_tokens: 350,
      });
      responseText = completion.choices[0]?.message?.content || '';
    } catch (groqErr) {
      console.warn('[MemoryExtractor] Groq extraction failed, checking fallback:', groqErr);
    }
  }

  // 2. Fallback to Gemini if Groq didn't succeed
  if (!responseText && process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 350,
        },
      });
      const result = await model.generateContent(extractionPrompt);
      responseText = result.response.text();
    } catch (geminiErr) {
      console.warn('[MemoryExtractor] Gemini extraction failed:', geminiErr);
    }
  }

  if (!responseText) return;

  // Clean JSON response (strip potential markdown code blocks)
  const cleaned = responseText
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  let facts: ExtractedFact[] = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      facts = parsed.filter(
        (f) =>
          f &&
          typeof f.key === 'string' &&
          typeof f.value === 'string' &&
          f.key.trim().length > 0 &&
          f.value.trim().length > 0
      );
    }
  } catch {
    // Regex extraction fallback if JSON parsing has trailing comments
    const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          facts = parsed.filter(
            (f) =>
              f &&
              typeof f.key === 'string' &&
              typeof f.value === 'string' &&
              f.key.trim().length > 0 &&
              f.value.trim().length > 0
          );
        }
      } catch {}
    }
  }

  if (facts.length === 0) return;

  console.log(`[MemoryExtractor] Discovered ${facts.length} durable facts:`, facts);

  // Write each extracted fact to Supabase memory (with automatic cache invalidation and proactive metadata)
  for (const fact of facts) {
    try {
      await rememberFact(profileId, fact.key.trim(), fact.value.trim(), {
        follow_up_relevant: Boolean(fact.follow_up_relevant),
        inferred_date: fact.inferred_date || null,
        topic: fact.topic || fact.key.trim(),
      });
    } catch (err) {
      console.warn(`[MemoryExtractor] Failed to store fact [${fact.key}]:`, err);
    }
  }
}
