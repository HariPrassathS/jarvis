// ──────────────────────────────────────────────
// SENTENCE SEGMENTER
// Intelligent sentence boundary detection for low-latency streaming TTS.
// Protects abbreviations, decimals, version numbers, domains, and acronyms.
// ──────────────────────────────────────────────

const COMMON_ABBREVIATIONS = [
  'e.g',
  'i.e',
  'etc',
  'vs',
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'st',
  'approx',
  'est',
  'min',
  'sec',
  'hr',
  'dept',
  'fig',
  'no',
  'vol',
  'inc',
  'ltd',
  'corp',
  'co',
  'u.s',
  'u.k',
];

/**
 * Checks whether a period at a given index is part of an abbreviation, decimal, version, domain, or code filename.
 */
function isProtectedPeriod(text: string, index: number): boolean {
  const prevChar = text[index - 1] || '';
  const nextChar = text[index + 1] || '';

  // 1. Decimals (e.g. 3.14) — dot strictly surrounded by digits
  if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
    return true;
  }

  // 2. Known file extensions / frameworks / domains (e.g. Node.js, Next.js, .tsx, .json)
  const afterWordMatch = text.slice(index + 1).match(/^(js|jsx|ts|tsx|json|env|css|html|md|yaml|yml|svg|png|pdf|com|org|net|io|ai|app)\b/i);
  if (afterWordMatch) {
    return true;
  }

  // 3. Dot followed immediately by a non-whitespace character (except closing quotes/brackets)
  if (nextChar && !/\s|['")\]}]/.test(nextChar)) {
    return true;
  }

  // 4. Check for common abbreviations preceding this dot (e.g., "e.g.", "i.e.", "Dr.")
  const beforeSlice = text.slice(Math.max(0, index - 15), index);
  const precedingWords = beforeSlice.split(/[\s,;()]/);
  const lastWord = (precedingWords[precedingWords.length - 1] || '').toLowerCase().replace(/^[^\w.]+|[^\w.]+$/g, '');

  if (COMMON_ABBREVIATIONS.includes(lastWord) || COMMON_ABBREVIATIONS.includes(lastWord.replace(/\.$/, ''))) {
    return true;
  }

  // 5. Middle initials or single letter acronyms with periods (e.g., "J." or "P.")
  if (/^[a-z]$/i.test(lastWord)) {
    return true;
  }

  return false;
}

/**
 * Find all valid sentence boundary offsets (end indices) in the given text.
 * Used by the streaming TTS orchestrator to slice newly completed sentences.
 */
export function findSentenceBoundaries(text: string): number[] {
  if (!text) return [];

  const boundaries: number[] = [];
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];

    // Check sentence terminators
    if (char === '.' || char === '?' || char === '!' || char === ';' || char === ':') {
      // For periods, verify it's not protected
      if (char === '.' && isProtectedPeriod(text, i)) {
        continue;
      }

      // Lookahead: Next char must be whitespace, closing punctuation followed by space, or end of string
      let nextPos = i + 1;
      while (nextPos < len && /['")\]}]/.test(text[nextPos])) {
        nextPos++;
      }

      if (nextPos >= len || /\s/.test(text[nextPos])) {
        // Valid boundary found at nextPos
        boundaries.push(nextPos);
        i = nextPos - 1; // Advance loop to skip closing quotes
      }
    }
  }

  return boundaries;
}

/**
 * Split complete text into clean, well-formed sentences.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const boundaries = findSentenceBoundaries(text);
  if (boundaries.length === 0) {
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }

  const sentences: string[] = [];
  let prev = 0;

  for (const b of boundaries) {
    const part = text.slice(prev, b).trim();
    if (part.length > 0) {
      sentences.push(part);
    }
    prev = b;
  }

  if (prev < text.length) {
    const tail = text.slice(prev).trim();
    if (tail.length > 0) {
      sentences.push(tail);
    }
  }

  return sentences;
}
