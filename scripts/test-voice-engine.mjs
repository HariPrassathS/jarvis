// ──────────────────────────────────────────────
// VOICE ENGINE TEST SUITE
// Validates pronunciation normalization, numbers/currencies,
// technical vocabulary, sentence segmentation, and prosody.
// ──────────────────────────────────────────────

import {
  cleanTextForSpeech,
  integerToWords,
  yearToWords,
  decimalToWords,
  normalizePronunciation,
} from '../src/lib/voice/pronunciation-normalizer.ts';
import {
  splitIntoSentences,
  findSentenceBoundaries,
} from '../src/lib/voice/sentence-segmenter.ts';
import {
  classifySentence,
  calculateProsody,
} from '../src/lib/voice/prosody-engine.ts';
import {
  resolveVoice,
} from '../src/lib/voice/voice-selector.ts';
import { VOICE_ENGINE_CONFIG } from '../src/lib/voice/voice-config.ts';

let passed = 0;
let failed = 0;

function assert(condition, message, detail = '') {
  if (condition) {
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    if (detail) console.error(`    ↳ Details: ${detail}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  J.A.R.V.I.S / F.R.I.D.A.Y Voice Engine Automated Test Suite');
console.log('================================================================\n');

// ── TEST 1: Number & Currency Conversion ──
console.log('--- Test 1: Number, Currency, & Decimal Expansion ---');
assert(integerToWords(25) === 'twenty-five', 'integerToWords(25) -> "twenty-five"');
assert(integerToWords(500) === 'five hundred', 'integerToWords(500) -> "five hundred"');
assert(yearToWords(2026) === 'twenty twenty-six', 'yearToWords(2026) -> "twenty twenty-six"');
assert(yearToWords(1999) === 'nineteen ninety-nine', 'yearToWords(1999) -> "nineteen ninety-nine"');
assert(decimalToWords(3, '14') === 'three point one four', 'decimalToWords(3, "14") -> "three point one four"');

const currencyRes1 = normalizePronunciation('The server cost is $25.');
assert(currencyRes1.includes('twenty-five dollars'), 'Normalizes $25 -> "twenty-five dollars"', currencyRes1);

const currencyRes2 = normalizePronunciation('Initial transfer was ₹500.');
assert(currencyRes2.includes('five hundred rupees'), 'Normalizes ₹500 -> "five hundred rupees"', currencyRes2);

const percentRes = normalizePronunciation('System efficiency is at 100% (or 72.5%).');
assert(percentRes.includes('one hundred percent') && percentRes.includes('seventy-two point five percent'), 'Normalizes 100% & 72.5%', percentRes);

const freqRes = normalizePronunciation('Telemetry audio sample rate is 44.1kHz.');
assert(freqRes.includes('forty-four point one kilohertz'), 'Normalizes 44.1kHz -> "forty-four point one kilohertz"', freqRes);

const dimRes = normalizePronunciation('Resolution is 1920x1080 with 3x scaling.');
assert(dimRes.includes('nineteen twenty by ten eighty') && dimRes.includes('three times'), 'Normalizes 1920x1080 and 3x', dimRes);

// ── TEST 2: Technical Vocabulary & Developer Terms ──
console.log('\n--- Test 2: Technical Vocabulary Normalization ---');
const techSample1 = normalizePronunciation('The REST API is returning a JSON response from PostgreSQL.');
assert(
  techSample1.includes('REST A P I') &&
  techSample1.includes('J-son') &&
  techSample1.includes('Postgres Q L'),
  'Normalizes REST API, JSON, and PostgreSQL',
  techSample1
);

const techSample2 = normalizePronunciation('The JavaScript function communicates with the Node.js backend through HTTPS.');
assert(
  techSample2.includes('Java-Script') &&
  techSample2.includes('Node dot J S') &&
  techSample2.includes('H T T P S'),
  'Normalizes JavaScript, Node.js, and HTTPS',
  techSample2
);

const techSample3 = normalizePronunciation('Deploy the Next.js app to Vercel and connect Supabase database.');
assert(
  techSample3.includes('Next dot J S') &&
  techSample3.includes('Ver-cell') &&
  techSample3.includes('Super-base'),
  'Normalizes Next.js, Vercel, and Supabase',
  techSample3
);

const techSample4 = normalizePronunciation('Abbreviations: AI, UI/UX, HTML, CSS, SQL, CLI, SDK, CPU, GPU, RAM.');
assert(
  techSample4.includes('A I') &&
  techSample4.includes('U I and U X') &&
  techSample4.includes('H T M L') &&
  techSample4.includes('C S S') &&
  techSample4.includes('S Q L') &&
  techSample4.includes('C L I') &&
  techSample4.includes('S D K') &&
  techSample4.includes('C P U') &&
  techSample4.includes('G P U') &&
  techSample4.includes('Ram'),
  'Normalizes standard developer acronyms',
  techSample4
);

// ── TEST 3: Creator & Assistant Identity ──
console.log('\n--- Test 3: Assistant & Creator Identity ---');
const creatorSample = normalizePronunciation('I was built by Hari Prassath S for J.A.R.V.I.S and F.R.I.D.A.Y.');
assert(
  creatorSample.includes('Hari Prassath Selvaraj') &&
  creatorSample.includes('Jarvis') &&
  creatorSample.includes('Friday'),
  'Expands creator name and assistant names properly',
  creatorSample
);

// ── TEST 4: Intelligent Sentence Segmentation ──
console.log('\n--- Test 4: Sentence Segmentation ---');
const textWithDecimalsAndAbbrevs = 'The system is v1.0. The temperature is 72.5 degrees e.g. normal operation. Is everything ready? Yes, sir!';
const sentences = splitIntoSentences(textWithDecimalsAndAbbrevs);

assert(sentences.length === 4, `Splits into exactly 4 sentences (received ${sentences.length})`, JSON.stringify(sentences));
assert(sentences[0] === 'The system is v1.0.', `Sentence 1 protected v1.0: "${sentences[0]}"`);
assert(sentences[1].includes('e.g. normal operation.'), `Sentence 2 protected e.g. & decimal: "${sentences[1]}"`);
assert(sentences[2] === 'Is everything ready?', `Sentence 3 question: "${sentences[2]}"`);
assert(sentences[3] === 'Yes, sir!', `Sentence 4 exclamation: "${sentences[3]}"`);

// ── TEST 5: Prosody Engine & Dynamic Modulation ──
console.log('\n--- Test 5: Prosody & Contextual Acoustic Classification ---');
assert(classifySentence('Warning! Mark VII suit integrity compromised.') === 'warning', 'Classifies warning sentence');
assert(classifySentence('All systems are operational and nominal.') === 'status', 'Classifies status report sentence');
assert(classifySentence('Understood, sir.') === 'acknowledgement', 'Classifies short acknowledgement sentence');
assert(classifySentence('Would you like me to run the simulation?') === 'question', 'Classifies question sentence');
assert(classifySentence('Excellent! Deployment finished successfully.') === 'enthusiastic', 'Classifies enthusiastic sentence');

const jarvisWarningProsody = calculateProsody('Warning. Core temperature rising.', 'jarvis');
const jarvisDefaultProsody = calculateProsody('I have processed the request.', 'jarvis');
assert(
  jarvisWarningProsody.rate < jarvisDefaultProsody.rate,
  `JARVIS warning rate (${jarvisWarningProsody.rate}) is slower and more deliberate than default (${jarvisDefaultProsody.rate})`
);

const fridayAckProsody = calculateProsody('Right away, boss.', 'friday');
const fridayDefaultProsody = calculateProsody('Here are the results you requested.', 'friday');
assert(
  fridayAckProsody.rate >= fridayDefaultProsody.rate && fridayAckProsody.pitch >= fridayDefaultProsody.pitch,
  `FRIDAY acknowledgement is snappy and clear (rate: ${fridayAckProsody.rate}, pitch: ${fridayAckProsody.pitch})`
);

// ── TEST 6: Voice Resolution Engine ──
console.log('\n--- Test 6: Voice Resolution Hierarchy ---');
const mockVoices = [
  { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', default: false },
  { name: 'Google UK English Male', lang: 'en-GB', default: false },
  { name: 'Moira', lang: 'en-IE', default: false },
  { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', default: true },
];

const resolvedJarvis = resolveVoice('jarvis', mockVoices);
assert(
  resolvedJarvis && resolvedJarvis.name === 'Google UK English Male',
  `JARVIS resolves preferred candidate: "${resolvedJarvis?.name}"`
);

const resolvedFriday = resolveVoice('friday', mockVoices);
assert(
  resolvedFriday && resolvedFriday.name === 'Moira',
  `FRIDAY resolves canonical Irish candidate: "${resolvedFriday?.name}"`
);

// Fallback test when preferred voices are absent
const sparseMockVoices = [
  { name: 'Generic Unknown Voice', lang: 'en-US', default: true },
];
const fallbackJarvis = resolveVoice('jarvis', sparseMockVoices);
assert(
  fallbackJarvis && fallbackJarvis.name === 'Generic Unknown Voice',
  `Safe fallback without crashing: "${fallbackJarvis?.name}"`
);

console.log('\n================================================================');
console.log(`  Test Summary: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
