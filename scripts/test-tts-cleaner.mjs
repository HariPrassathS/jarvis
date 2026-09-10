import { cleanTextForSpeech } from '../src/hooks/useSpeechSynthesis.ts';

const testInputs = [
  "**Mark 85** status is **online**, sir. Armor integrity is at 98.4%.",
  "***Warning***: Power diverted to *repulsors*! Stagnation temperature is 650°C at 500km/h.",
  "### Diagnostics Report\n* Core: 8.4 GJ/s\n* Nanotech: 96%\n* Thrusters: Optimal",
  "Here is the data: [Stark Industries](https://stark.com) - `calc(42)` completed ⚡✦.",
];

console.log("--- TTS TEXT CLEANING VERIFICATION ---");
for (const input of testInputs) {
  console.log("\nORIGINAL:");
  console.log(input);
  console.log("CLEANED FOR SPEECH:");
  const cleaned = cleanTextForSpeech(input);
  console.log(cleaned);
  if (cleaned.includes('*') || cleaned.includes('#') || cleaned.includes('`') || cleaned.includes('⚡')) {
    console.error("❌ FAILED: Found prohibited character in cleaned text!");
    process.exit(1);
  }
}
console.log("\n✅ ALL TTS SANITIZATION CHECKS PASSED — 0 ASTERISKS GUARANTEED!");
