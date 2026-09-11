// ──────────────────────────────────────────────
// PROSODY & DYNAMIC RATE/PITCH ENGINE
// Calculates nuanced acoustic delivery (rate, pitch, volume)
// based on sentence semantics, punctuation, length, and active persona.
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';
import { VOICE_ENGINE_CONFIG, type PersonaVoiceConfig } from './voice-config';

export interface ProsodyParameters {
  rate: number;
  pitch: number;
  volume: number;
  pauseAfterMs: number;
}

export type SentenceType =
  | 'status'
  | 'warning'
  | 'acknowledgement'
  | 'question'
  | 'enthusiastic'
  | 'explanation'
  | 'default';

/**
 * Classify a sentence to determine appropriate acoustic and prosodic delivery.
 */
export function classifySentence(sentence: string): SentenceType {
  const trimmed = sentence.trim();
  const lower = trimmed.toLowerCase();

  // 1. Warning / Critical Alerts
  if (
    /^(warning|caution|alert|critical|threat detected|emergency|danger|attention|security breach)/i.test(
      lower
    ) ||
    lower.includes('offline') ||
    lower.includes('compromised') ||
    lower.includes('anomaly detected')
  ) {
    return 'warning';
  }

  // 2. Short Acknowledgements
  if (
    /^(understood|acknowledged|right away|on it|very well|certainly|of course|at once|copy that|affirmative|confirmed)(,\s*(sir|boss))?[.,!]?$/i.test(
      lower
    ) ||
    (trimmed.length <= 25 &&
      /^(yes sir|yes boss|right away sir|right away boss|all done)[.,!]?$/i.test(lower))
  ) {
    return 'acknowledgement';
  }

  // 3. Status / Telemetry Reports
  if (
    /^(all systems|system status|telemetry|diagnostics|quantum core|mark [ivxlcdm]+|flight dynamics|atmospheric telemetry|protocols active)/i.test(
      lower
    ) ||
    lower.includes('operational') ||
    lower.includes('nominal') ||
    lower.includes('synchronized')
  ) {
    return 'status';
  }

  // 4. Questions (rising contour)
  if (trimmed.endsWith('?')) {
    return 'question';
  }

  // 5. Exclamations / Enthusiastic Outcomes
  if (trimmed.endsWith('!') || /^(excellent|outstanding|splendid|done|perfect|mission accomplished)/i.test(lower)) {
    return 'enthusiastic';
  }

  // 6. Long Explanatory Sentences (>110 characters)
  if (trimmed.length >= 110) {
    return 'explanation';
  }

  return 'default';
}

/**
 * Calculate dynamic acoustic parameters (rate, pitch, volume, inter-sentence pause)
 * based on sentence context and persona acoustic profile.
 */
export function calculateProsody(
  sentence: string,
  persona: VoicePersona = 'jarvis'
): ProsodyParameters {
  const personaConfig: PersonaVoiceConfig = VOICE_ENGINE_CONFIG.personas[persona];
  const type = classifySentence(sentence);

  let rate = personaConfig.baseRate;
  let pitch = personaConfig.basePitch;
  let volume = personaConfig.baseVolume;
  let pauseAfterMs = 120; // Default natural pause between sentences

  switch (type) {
    case 'warning': {
      rate = personaConfig.prosodyModifiers.warning.rate;
      pitch = personaConfig.prosodyModifiers.warning.pitch;
      pauseAfterMs = 240; // Longer deliberate pause after a warning
      break;
    }
    case 'acknowledgement': {
      rate = personaConfig.prosodyModifiers.acknowledgement.rate;
      pitch = personaConfig.prosodyModifiers.acknowledgement.pitch;
      pauseAfterMs = 100; // Crisp rapid transition
      break;
    }
    case 'status': {
      rate = personaConfig.prosodyModifiers.status.rate;
      pitch = personaConfig.prosodyModifiers.status.pitch;
      pauseAfterMs = 160;
      break;
    }
    case 'question': {
      rate = personaConfig.prosodyModifiers.question.rate;
      pitch = personaConfig.prosodyModifiers.question.pitch;
      pauseAfterMs = 180;
      break;
    }
    case 'enthusiastic': {
      rate = personaConfig.prosodyModifiers.enthusiastic.rate;
      pitch = personaConfig.prosodyModifiers.enthusiastic.pitch;
      pauseAfterMs = 140;
      break;
    }
    case 'explanation': {
      rate = personaConfig.prosodyModifiers.explanation.rate;
      pitch = personaConfig.prosodyModifiers.explanation.pitch;
      pauseAfterMs = 150;
      break;
    }
    default: {
      rate = personaConfig.baseRate;
      pitch = personaConfig.basePitch;
      pauseAfterMs = 120;
      break;
    }
  }

  return {
    rate: Math.max(0.7, Math.min(1.5, Number(rate.toFixed(2)))),
    pitch: Math.max(0.5, Math.min(1.8, Number(pitch.toFixed(2)))),
    volume: Math.max(0, Math.min(1.0, volume)),
    pauseAfterMs,
  };
}
