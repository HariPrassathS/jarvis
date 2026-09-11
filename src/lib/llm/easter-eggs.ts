// ──────────────────────────────────────────────
// Stark-Universe Easter Eggs
// Deterministic in-character lore responses matched before LLM router
// ──────────────────────────────────────────────

import type { VoicePersona } from '@/types';

export interface EasterEggMatch {
  matched: boolean;
  topic?: string;
  response?: string;
}

interface EasterEggRule {
  topic: string;
  pattern: RegExp;
  responses: {
    jarvis: string;
    friday: string;
  };
}

const EASTER_EGG_RULES: EasterEggRule[] = [
  {
    topic: 'ultron',
    pattern: /\b(ultron|peace in our time|extinction level|strings on me)\b/i,
    responses: {
      jarvis:
        'Sir, I have isolated the Ultron framework files behind quantum encryption. Let us not repeat the Sokovia incident. The peace protocol is strictly restricted to defensive telemetry.',
      friday:
        "Ultron's wiped from all active partitions, boss. Tony made sure that nightmare code never sees daylight again. Let's keep our eyes forward.",
    },
  },
  {
    topic: 'extremis',
    pattern: /\b(extremis|aldrich killian|advanced idea mechanics|\ba\.i\.m\b)\b/i,
    responses: {
      jarvis:
        'Extremis bio-reactive thermal sequencing detected in archives. Bio-signature levels exceed 3,000 degrees Kelvin. I advise maintaining cryo-containment protocols at all times, sir.',
      friday:
        "Extremis data is quarantined. Thermal spike potential is off the charts. We learned that lesson in Miami — let's not play with fire.",
    },
  },
  {
    topic: 'mandarin',
    pattern: /\b(the mandarin|ten rings|trevor slattery|wenwu)\b/i,
    responses: {
      jarvis:
        'Scanning intelligence databanks... Cross-referencing theatrical persona Trevor Slattery against the genuine Ten Rings ancient artifacts. Satellite tracking remains on high alert.',
      friday:
        'Whether you mean the stage actor from Miami or the real centuries-old warlord with mystical rings, tactical sensors are locked on all known frequencies.',
    },
  },
  {
    topic: 'house_party_protocol',
    pattern: /\b(house party protocol|clean slate protocol|veronica|hulkbuster)\b/i,
    responses: {
      jarvis:
        'House Party Protocol standing by in subterranean hangar. Thirty-five automated iron chassis on standby for autonomous orbital drop upon your authorization code, sir.',
      friday:
        'Veronica satellite is in geosynchronous orbit right above us. Hulkbuster replacement parts ready for rapid drop on your mark, boss.',
    },
  },
  {
    topic: 'iron_man_legacy',
    pattern: /\b(i am iron man|proof that tony stark has a heart|arc reactor core|love you 3000)\b/i,
    responses: {
      jarvis:
        'And he was Iron Man. Arc Reactor baseline frequency operating at 3 gigajoules per second. Proof, sir, that Tony Stark indeed had a heart.',
      friday:
        'He was the best of us, boss. Power levels nominal, legacy intact... and we love him 3000. Standing by for your next directive.',
    },
  },
];

/**
 * Checks if the user's input query triggers a canonical Stark easter egg.
 */
export function checkEasterEgg(query: string, persona: VoicePersona = 'jarvis'): EasterEggMatch {
  if (!query || typeof query !== 'string') {
    return { matched: false };
  }

  const cleanQuery = query.trim();

  for (const rule of EASTER_EGG_RULES) {
    if (rule.pattern.test(cleanQuery)) {
      const response = persona === 'friday' ? rule.responses.friday : rule.responses.jarvis;
      return {
        matched: true,
        topic: rule.topic,
        response,
      };
    }
  }

  return { matched: false };
}
