// ──────────────────────────────────────────────
// PRONUNCIATION NORMALIZER
// Preprocesses text before synthesis for maximum naturalness, clarity,
// proper technical vocabulary, and natural number/currency/unit prosody.
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';
import { VOICE_ENGINE_CONFIG } from './voice-config';
import { COMPILED_PRONUNCIATION_ENTRIES } from './pronunciation-dictionary';

// Number words tables
const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

const DIGITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];

/**
 * Convert an integer (0 to 999,999,999) into spoken English words.
 */
export function integerToWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 0) return `negative ${integerToWords(Math.abs(n))}`;

  if (n < 20) return ONES[n];

  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    return rem > 0 ? `${TENS[tens]}-${ONES[rem]}` : TENS[tens];
  }

  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    const remText = rem > 0 ? ` ${integerToWords(rem)}` : '';
    return `${ONES[hundreds]} hundred${remText}`;
  }

  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    const remText = rem > 0 ? ` ${integerToWords(rem)}` : '';
    return `${integerToWords(thousands)} thousand${remText}`;
  }

  if (n < 1000000000) {
    const millions = Math.floor(n / 1000000);
    const rem = n % 1000000;
    const remText = rem > 0 ? ` ${integerToWords(rem)}` : '';
    return `${integerToWords(millions)} million${remText}`;
  }

  return n.toString();
}

/**
 * Convert 4-digit years (e.g. 2026 -> "twenty twenty-six", 1999 -> "nineteen ninety-nine")
 */
export function yearToWords(year: number): string {
  if (year >= 2000 && year <= 2009) {
    return `two thousand${year === 2000 ? '' : ` ${ONES[year - 2000]}`}`;
  }
  if (year >= 2010 && year <= 2099) {
    const firstTwo = Math.floor(year / 100);
    const lastTwo = year % 100;
    return `${integerToWords(firstTwo)} ${integerToWords(lastTwo)}`;
  }
  if (year >= 1900 && year <= 1999) {
    const firstTwo = Math.floor(year / 100);
    const lastTwo = year % 100;
    return `${integerToWords(firstTwo)} ${integerToWords(lastTwo)}`;
  }
  return integerToWords(year);
}

/**
 * Convert decimal numbers to words (e.g. 3.14 -> "three point one four")
 */
export function decimalToWords(intPart: number, decStr: string): string {
  const intWords = integerToWords(intPart);
  const decWords = decStr
    .split('')
    .map((d) => DIGITS[parseInt(d, 10)] || d)
    .join(' ');
  return `${intWords} point ${decWords}`;
}

/**
 * Foundational text cleaner for speech synthesis.
 * Strips markdown, code blocks, emojis, hashtags, and unpronounceable characters.
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, ' ')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove markdown bold/italics
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove remaining stray asterisks
      .replace(/\*/g, '')
      // Remove markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points
      .replace(/^[\s]*[-+*]\s+/gm, '')
      // Remove divider lines
      .replace(/^[-=_]{3,}$/gm, '')
      // Remove HTML tags
      .replace(/<\/?[^>]+(>|$)/g, ' ')
      // Remove emojis & decorative symbols
      .replace(
        /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}✦⚡📊🛡️✓✕]/gu,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Intelligent pronunciation normalizer.
 * Applies technical terminology mappings, natural numbers, currencies, units, and pacing.
 */
export function normalizePronunciation(text: string, persona?: VoicePersona): string {
  if (!text) return '';

  const { enabled, normalizeNumbers, normalizeTechTerms, normalizeCurrencies, normalizeCodeOperators } =
    VOICE_ENGINE_CONFIG.pronunciation;

  // 1. Step 1: Base text cleaning
  let processed = cleanTextForSpeech(text);
  if (!enabled || !processed) return processed;

  // 2. Step 2: Code Operators in Conversational Speech
  if (normalizeCodeOperators) {
    processed = processed
      .replace(/\s*===\s*/g, ' strictly equals ')
      .replace(/\s*!==\s*/g, ' does not equal ')
      .replace(/\s*==\s*/g, ' equals ')
      .replace(/\s*!=\s*/g, ' does not equal ')
      .replace(/\s*=>\s*/g, ' arrow ')
      .replace(/\s*&&\s*/g, ' and ')
      .replace(/\s*\|\|\s*/g, ' or ')
      .replace(/\+\+/g, ' plus plus ')
      .replace(/--/g, ' minus minus ');
  }

  // 3. Step 3: Technical units, frequencies, and metrics
  processed = processed
    .replace(/(\d+(?:\.\d+)?)\s*kHz\b/gi, (_, n) => `${n} kilohertz`)
    .replace(/(\d+(?:\.\d+)?)\s*MHz\b/gi, (_, n) => `${n} megahertz`)
    .replace(/(\d+(?:\.\d+)?)\s*GHz\b/gi, (_, n) => `${n} gigahertz`)
    .replace(/(\d+(?:\.\d+)?)\s*ms\b/gi, (_, n) => `${n} milliseconds`)
    .replace(/(\d+(?:\.\d+)?)\s*s\b(?!\w)/gi, (_, n) => `${n} seconds`)
    .replace(/(\d+(?:\.\d+)?)\s*KB\b/gi, (_, n) => `${n} kilobytes`)
    .replace(/(\d+(?:\.\d+)?)\s*MB\b/gi, (_, n) => `${n} megabytes`)
    .replace(/(\d+(?:\.\d+)?)\s*GB\b/gi, (_, n) => `${n} gigabytes`)
    .replace(/(\d+(?:\.\d+)?)\s*TB\b/gi, (_, n) => `${n} terabytes`)
    .replace(/(\d+(?:\.\d+)?)\s*fps\b/gi, (_, n) => `${n} frames per second`)
    .replace(/(\d+(?:\.\d+)?)\s*px\b/gi, (_, n) => `${n} pixels`)
    .replace(/(\d+(?:\.\d+)?)\s*km\/h\b/gi, (_, n) => `${n} kilometers per hour`)
    .replace(/(\d+(?:\.\d+)?)\s*m\/s\b/gi, (_, n) => `${n} meters per second`)
    .replace(/(\d+(?:\.\d+)?)\s*GJ\/s\b/gi, (_, n) => `${n} gigajoules per second`)
    .replace(/(\d+(?:\.\d+)?)\s*MJ\b/gi, (_, n) => `${n} megajoules`)
    .replace(/(\d+(?:\.\d+)?)\s*°C\b/gi, (_, n) => `${n} degrees Celsius`)
    .replace(/(\d+(?:\.\d+)?)\s*°F\b/gi, (_, n) => `${n} degrees Fahrenheit`);

  // 4. Step 4: Currencies
  if (normalizeCurrencies) {
    // Dollar ($25, $25.50)
    processed = processed.replace(/\$(\d+)(?:\.(\d{1,2}))?\b/g, (_, intStr, decStr) => {
      const intVal = parseInt(intStr, 10);
      const intWords = integerToWords(intVal);
      if (decStr) {
        const centsVal = parseInt(decStr.padEnd(2, '0'), 10);
        return `${intWords} dollars and ${integerToWords(centsVal)} cents`;
      }
      return `${intWords} dollar${intVal === 1 ? '' : 's'}`;
    });

    // Indian Rupee (₹500, Rs. 500)
    processed = processed.replace(/(?:₹|Rs\.?\s*)(\d+)(?:\.(\d{1,2}))?\b/g, (_, intStr) => {
      const intVal = parseInt(intStr, 10);
      return `${integerToWords(intVal)} rupees`;
    });

    // Euro (€100)
    processed = processed.replace(/€(\d+)(?:\.(\d{1,2}))?\b/g, (_, intStr) => {
      const intVal = parseInt(intStr, 10);
      return `${integerToWords(intVal)} euros`;
    });

    // British Pound (£50)
    processed = processed.replace(/£(\d+)(?:\.(\d{1,2}))?\b/g, (_, intStr) => {
      const intVal = parseInt(intStr, 10);
      return `${integerToWords(intVal)} pounds`;
    });
  }

  // 5. Step 5: Percentages (100%, 72.5%)
  processed = processed.replace(/(\d+)(?:\.(\d+))?%/g, (_, intStr, decStr) => {
    const intVal = parseInt(intStr, 10);
    if (decStr) {
      return `${decimalToWords(intVal, decStr)} percent`;
    }
    return `${integerToWords(intVal)} percent`;
  });

  // 6. Step 6: Multiplier & Dimension (1920x1080, 4K, 10x)
  processed = processed
    .replace(/\b(\d+)x(\d+)\b/gi, (_, w, h) => {
      const wVal = parseInt(w, 10);
      const hVal = parseInt(h, 10);
      const formatRes = (n: number) => {
        if (n === 1920) return 'nineteen twenty';
        if (n === 1080) return 'ten eighty';
        if (n === 1440) return 'fourteen forty';
        if (n === 720) return 'seven twenty';
        if (n === 480) return 'four eighty';
        return integerToWords(n);
      };
      return `${formatRes(wVal)} by ${formatRes(hVal)}`;
    })
    .replace(/\b(\d+)x\b/gi, (_, n) => `${integerToWords(parseInt(n, 10))} times`);

  // 7. Step 7: Version strings (v1.0 -> version one point zero, v2.4 -> version two point four)
  processed = processed.replace(/\bv(\d+)\.(\d+)(?:\.(\d+))?\b/gi, (_, maj, min, patch) => {
    let ver = `version ${integerToWords(parseInt(maj, 10))} point ${DIGITS[parseInt(min, 10)] || min}`;
    if (patch) {
      ver += ` point ${DIGITS[parseInt(patch, 10)] || patch}`;
    }
    return ver;
  });

  // 8. Step 8: Ordinals (1st, 2nd, 3rd, 4th...)
  processed = processed.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n, suffix) => {
    const num = parseInt(n, 10);
    if (num === 1) return 'first';
    if (num === 2) return 'second';
    if (num === 3) return 'third';
    if (num === 4) return 'fourth';
    if (num === 5) return 'fifth';
    if (num === 6) return 'sixth';
    if (num === 7) return 'seventh';
    if (num === 8) return 'eighth';
    if (num === 9) return 'ninth';
    if (num === 10) return 'tenth';
    if (num === 11) return 'eleventh';
    if (num === 12) return 'twelfth';
    if (num === 20) return 'twentieth';
    if (num === 21) return 'twenty-first';
    if (num === 22) return 'twenty-second';
    if (num === 23) return 'twenty-third';
    if (num === 30) return 'thirtieth';
    if (num === 31) return 'thirty-first';
    return `${integerToWords(num)}${suffix.toLowerCase()}`;
  });

  // 9. Step 9: 4-digit Years (1900-2099)
  if (normalizeNumbers) {
    processed = processed.replace(
      /\b(19\d{2}|20\d{2})\b/g,
      (match, yrStr, offset, fullStr) => {
        const prevChar = fullStr[offset - 1] || '';
        const nextChar = fullStr[offset + yrStr.length] || '';
        if (prevChar === '.' || nextChar === '.' || prevChar === ':' || nextChar === ':') {
          return match;
        }
        return yearToWords(parseInt(yrStr, 10));
      }
    );

    // Decimals (e.g. 3.14, 0.05, 72.5)
    processed = processed.replace(/\b(\d+)\.(\d{1,4})\b/g, (match, intStr, decStr, offset, fullStr) => {
      const prevChar = fullStr[offset - 1] || '';
      if (prevChar === '/' || prevChar === '\\' || prevChar === '@') return match;
      const intVal = parseInt(intStr, 10);
      return decimalToWords(intVal, decStr);
    });
  }

  // 10. Step 10: Technical Dictionary Substitution
  if (normalizeTechTerms) {
    for (const entry of COMPILED_PRONUNCIATION_ENTRIES) {
      processed = processed.replace(entry.pattern, entry.spoken);
    }
  }

  // 11. Step 11: Prosody and pause spacing cleanup
  processed = processed
    .replace(/\s*([,;:?.!])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return processed;
}
