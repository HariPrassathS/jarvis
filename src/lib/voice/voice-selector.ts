// ──────────────────────────────────────────────
// VOICE RESOLUTION & SELECTION ENGINE
// Dynamically resolves the highest-quality browser/OS voice
// for J.A.R.V.I.S and F.R.I.D.A.Y with deterministic fallbacks.
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';
import { VOICE_ENGINE_CONFIG } from './voice-config';
import { diagnosticLogger } from '@/lib/debug/diagnostic-logger';

// Regex matching known female voice identifiers
export const FEMALE_VOICE_REGEX =
  /female|woman|girl|zira|aria|jenny|sonia|moira|samantha|karen|fiona|victoria|libby|stephanie|serena|martha|tessa|susan|zoe|ava|hazel|en-gb-x-fis/i;

// Regex matching known male voice identifiers
export const MALE_VOICE_REGEX =
  /male|guy|david|george|brian|ryan|paul|daniel|arthur|oliver|aaron|fred|gordon|rishi|james|en-gb-x-rjs|en-us-x-sfg|en-us-x-iog|en-us-x-tpd/i;

/**
 * Resolve the optimal speech synthesis voice for the requested persona.
 */
export function resolveVoice(
  persona: VoicePersona,
  availableVoices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!availableVoices || availableVoices.length === 0) {
    return null;
  }

  const personaConfig = VOICE_ENGINE_CONFIG.personas[persona];
  const preferredCandidates = personaConfig.preferredVoices;

  // 1. Priority 1: Exact or substring match against ranked candidate list
  for (const candidate of preferredCandidates) {
    const candidateLower = candidate.toLowerCase();
    const match = availableVoices.find(
      (v) => v.name.toLowerCase() === candidateLower || v.name.toLowerCase().includes(candidateLower)
    );
    if (match) {
      if (VOICE_ENGINE_CONFIG.debug) {
        console.log(`[VOICE] Persona: ${persona.toUpperCase()} | Selected Voice: "${match.name}" (${match.lang}) [Preferred Candidate: "${candidate}"]`);
      }
      diagnosticLogger.log('tts', `Voice resolved: "${match.name}" for ${persona.toUpperCase()}`);
      return match;
    }
  }

  // 2. Priority 2: Persona-specific heuristics (Gender + English locale)
  if (persona === 'friday') {
    // A. Irish English female voice (canonical MCU FRIDAY)
    const irishFemale = availableVoices.find(
      (v) => v.lang.toLowerCase().includes('en-ie') || v.name.toLowerCase().includes('irish')
    );
    if (irishFemale) {
      diagnosticLogger.log('tts', `FRIDAY heuristic: Irish voice "${irishFemale.name}"`);
      return irishFemale;
    }

    // B. Any high-quality English female voice
    const femaleEnglish = availableVoices.find(
      (v) => v.lang.startsWith('en') && FEMALE_VOICE_REGEX.test(v.name)
    );
    if (femaleEnglish) {
      diagnosticLogger.log('tts', `FRIDAY heuristic: English female voice "${femaleEnglish.name}"`);
      return femaleEnglish;
    }

    // C. Any non-male English voice
    const nonMaleEnglish = availableVoices.find(
      (v) => v.lang.startsWith('en') && !MALE_VOICE_REGEX.test(v.name)
    );
    if (nonMaleEnglish) {
      return nonMaleEnglish;
    }
  } else {
    // JARVIS Heuristics:
    // A. British English male voice (canonical MCU JARVIS)
    const britishMale = availableVoices.find(
      (v) =>
        (v.lang.toLowerCase().includes('en-gb') || v.lang.toLowerCase().includes('en_uk')) &&
        !FEMALE_VOICE_REGEX.test(v.name)
    );
    if (britishMale) {
      diagnosticLogger.log('tts', `JARVIS heuristic: British male voice "${britishMale.name}"`);
      return britishMale;
    }

    // B. Any English male voice
    const maleEnglish = availableVoices.find(
      (v) => v.lang.startsWith('en') && MALE_VOICE_REGEX.test(v.name) && !FEMALE_VOICE_REGEX.test(v.name)
    );
    if (maleEnglish) {
      diagnosticLogger.log('tts', `JARVIS heuristic: English male voice "${maleEnglish.name}"`);
      return maleEnglish;
    }

    // C. Any non-female English voice
    const nonFemaleEnglish = availableVoices.find(
      (v) => v.lang.startsWith('en') && !FEMALE_VOICE_REGEX.test(v.name)
    );
    if (nonFemaleEnglish) {
      return nonFemaleEnglish;
    }
  }

  // 3. Priority 3: Fallback list match
  for (const fallback of personaConfig.fallbackVoices) {
    const fallbackMatch = availableVoices.find(
      (v) => v.lang.toLowerCase().includes(fallback.toLowerCase()) || v.name.toLowerCase().includes(fallback.toLowerCase())
    );
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }

  // 4. Priority 4: Any English voice or system default voice
  const defaultEnglish = availableVoices.find((v) => v.lang.startsWith('en'));
  if (defaultEnglish) {
    return defaultEnglish;
  }

  const systemDefault = availableVoices.find((v) => v.default) || availableVoices[0];
  return systemDefault || null;
}
