// ──────────────────────────────────────────────
// Automatic Background Memory Extractor
// Runs fire-and-forget after every assistant response
// Extracts durable facts and commits them to Supabase memory
// ──────────────────────────────────────────────

import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { rememberFact } from '@/lib/tools/memory';

export interface ExtractedFact {
  key: string;
  value: string;
}

/**
 * Lightweight extraction prompt to isolate durable operator facts
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

  const extractionPrompt = `You are a memory extraction engine for J.A.R.V.I.S.
Your ONLY job is to extract durable, persistent facts about the user (the operator) from this single conversational exchange that are worth remembering long-term.

Durable facts include:
- Ongoing projects, apps, ventures, or robotics (e.g. project name, tech stack, goals)
- Personal details, profession, job role, skills, interests
- Explicit or implicit preferences (e.g. coding conventions, language choices, workflows)
- Names of collaborators, colleagues, pets, or significant entities mentioned
- Hardware, servers, or environment details

DO NOT extract:
- Casual chit-chat, greetings, or pleasantries ("hello", "how are you", "good morning")
- Ephemeral queries or one-off questions ("what is the weather", "calculate 42*5")
- J.A.R.V.I.S's own capabilities, status, or system remarks
- Transient states ("I'm tired", "I will be back in 5 minutes")

Return STRICTLY a JSON array of objects with "key" and "value" string properties.
- "key": short, descriptive snake_case identifier (e.g. "robotics_project_nova", "preferred_language", "pet_dog")
- "value": clear, concise fact summary (e.g. "Nova (robotics project)", "Works primarily in Rust", "Has a dog named Max")

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
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.1,
        max_tokens: 256,
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
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
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

  // Write each extracted fact to Supabase memory (with automatic cache invalidation)
  for (const fact of facts) {
    try {
      await rememberFact(profileId, fact.key.trim(), fact.value.trim());
    } catch (err) {
      console.warn(`[MemoryExtractor] Failed to store fact [${fact.key}]:`, err);
    }
  }
}
