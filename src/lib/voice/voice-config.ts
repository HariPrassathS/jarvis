// ──────────────────────────────────────────────
// VOICE ENGINE CONFIGURATION
// Centralized tuning and voice candidate registry for J.A.R.V.I.S & F.R.I.D.A.Y
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';

export interface PersonaVoiceConfig {
  baseRate: number;
  basePitch: number;
  baseVolume: number;
  preferredVoices: string[];
  fallbackVoices: string[];
  prosodyModifiers: {
    status: { rate: number; pitch: number };
    warning: { rate: number; pitch: number };
    acknowledgement: { rate: number; pitch: number };
    explanation: { rate: number; pitch: number };
    enthusiastic: { rate: number; pitch: number };
    question: { rate: number; pitch: number };
  };
}

export interface VoiceEngineConfig {
  debug: boolean;
  pronunciation: {
    enabled: boolean;
    normalizeNumbers: boolean;
    normalizeTechTerms: boolean;
    normalizeCurrencies: boolean;
    normalizeCodeOperators: boolean;
  };
  personas: Record<VoicePersona, PersonaVoiceConfig>;
}

export const VOICE_ENGINE_CONFIG: VoiceEngineConfig = {
  // Set to true in development for [VOICE] debug telemetry
  debug: process.env.NODE_ENV === 'development',

  pronunciation: {
    enabled: true,
    normalizeNumbers: true,
    normalizeTechTerms: true,
    normalizeCurrencies: true,
    normalizeCodeOperators: true,
  },

  personas: {
    jarvis: {
      // Measured, composed, British butler refinement
      baseRate: 0.98,
      basePitch: 0.88,
      baseVolume: 1.0,
      preferredVoices: [
        'Google UK English Male',
        'Daniel', // macOS / iOS UK male (Canonical JARVIS)
        'Oliver', // macOS / iOS UK male
        'Arthur', // macOS / iOS UK male
        'Microsoft Ryan Online (Natural) - English (United Kingdom)',
        'Microsoft Ryan',
        'Microsoft George', // Windows UK male
        'Microsoft Guy Online (Natural) - English (United States)',
        'Microsoft Guy',
        'Aaron', // iOS US male
        'Fred', // macOS / iOS male
        'Gordon', // macOS / iOS Australian male
        'Rishi', // macOS / iOS Indian English male
        'Nicky', // iOS male
        'en-gb-x-rjs-local', // Android Google TTS UK Male
        'en-gb-x-rjs-network',
        'en-us-x-sfg-local', // Android Google TTS US Male
        'en-us-x-sfg-network',
        'en-us-x-iog-network',
        'en-us-x-tpd-network',
        'en-GB-Neural2-B',
        'en-GB-Wavenet-B',
        'en-GB-Standard-B',
        'James', // macOS Australian male
        'Google US English',
      ],
      fallbackVoices: [
        'Google UK English Male',
        'Daniel',
        'Microsoft George',
        'en-GB',
        'en-US',
      ],
      prosodyModifiers: {
        status: { rate: 0.96, pitch: 0.86 },
        warning: { rate: 0.92, pitch: 0.84 },
        acknowledgement: { rate: 1.02, pitch: 0.90 },
        explanation: { rate: 0.95, pitch: 0.88 },
        enthusiastic: { rate: 1.02, pitch: 0.92 },
        question: { rate: 0.97, pitch: 0.92 },
      },
    },

    friday: {
      // Warm, tactical, crisp Irish/British/US female persona
      baseRate: 1.02,
      basePitch: 1.10,
      baseVolume: 1.0,
      preferredVoices: [
        'Moira', // macOS / iOS Irish female (Canonical MCU FRIDAY)
        'Google UK English Female',
        'Microsoft Aria Online (Natural) - English (United States)',
        'Microsoft Aria',
        'Microsoft Sonia Online (Natural) - English (United Kingdom)',
        'Microsoft Sonia',
        'Microsoft Jenny Online (Natural) - English (United States)',
        'Microsoft Jenny',
        'Microsoft Libby Online (Natural) - English (United Kingdom)',
        'Microsoft Libby',
        'Samantha', // macOS / iOS US female
        'Karen', // macOS / iOS Australian female
        'Victoria', // macOS US female
        'Fiona', // macOS Scottish female
        'Tessa', // iOS South African female
        'Zoe', // iOS / macOS female
        'Ava', // iOS female
        'en-ie-x-tfn-local', // Android Google TTS Irish female
        'en-ie-x-tfn-network',
        'en-gb-x-fis-local', // Android Google TTS UK female
        'en-gb-x-fis-network',
        'en-IE',
        'Google Irish',
        'Google English Female',
      ],
      fallbackVoices: [
        'Moira',
        'Google UK English Female',
        'Microsoft Aria',
        'Samantha',
        'en-IE',
        'en-GB',
        'en-US',
      ],
      prosodyModifiers: {
        status: { rate: 1.02, pitch: 1.08 },
        warning: { rate: 0.96, pitch: 1.04 },
        acknowledgement: { rate: 1.06, pitch: 1.12 },
        explanation: { rate: 1.0, pitch: 1.08 },
        enthusiastic: { rate: 1.08, pitch: 1.15 },
        question: { rate: 1.02, pitch: 1.14 },
      },
    },
  },
};
