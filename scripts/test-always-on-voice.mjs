// ──────────────────────────────────────────────
// ALWAYS-ON VOICE MODE TEST BATTERY
// Verifying VAD, Silence Debounce, Barge-In, Auto-Restart, and Mute State
// ──────────────────────────────────────────────

class MockAlwaysOnVoiceEngine {
  constructor(options = {}) {
    this.silenceDebounceMs = options.silenceDebounceMs || 800;
    this.onSpeechComplete = options.onSpeechComplete;
    this.onBargeIn = options.onBargeIn;
    this.isSpeaking = false;
    this.isLoading = false;
    this.isMuted = false;
    this.isListening = false;
    this.isUserSpeaking = false;
    this.accumulatedText = '';
    this.interimTranscript = '';
    this.silenceTimer = null;
    this.restartsCount = 0;
  }

  start() {
    if (this.isMuted) return;
    this.isListening = true;
  }

  stop() {
    this.isListening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stop();
      this.interimTranscript = '';
      this.isUserSpeaking = false;
    } else {
      this.start();
    }
  }

  // Simulate onend from Web Speech API
  simulateOnEnd() {
    this.isListening = false;
    if (!this.isMuted) {
      this.restartsCount++;
      this.start(); // Auto-restart loop
    }
  }

  // Simulate incoming speech chunks from user microphone
  simulateSpeechChunk(text, isFinal = false) {
    if (this.isMuted || !this.isListening) return;

    // Barge-In Interruption check
    if (this.isSpeaking) {
      this.isSpeaking = false;
      if (this.onBargeIn) this.onBargeIn();
    }

    if (isFinal) {
      this.accumulatedText += text + ' ';
    } else {
      this.interimTranscript = text;
    }
    this.isUserSpeaking = true;

    // VAD Silence timer reset
    if (this.silenceTimer) clearTimeout(this.silenceTimer);

    const capturedSpoken = `${this.accumulatedText} ${this.interimTranscript}`
      .replace(/\s+/g, ' ')
      .trim();

    this.silenceTimer = setTimeout(() => {
      if (capturedSpoken.length > 1 && !this.isLoading) {
        this.accumulatedText = '';
        this.interimTranscript = '';
        this.isUserSpeaking = false;
        if (this.onSpeechComplete) {
          this.onSpeechComplete(capturedSpoken);
        }
      }
    }, this.silenceDebounceMs);
  }
}

async function runVoiceTests() {
  console.log('\n======================================================');
  console.log('🎙️ J.A.R.V.I.S ALWAYS-ON VOICE MODE TEST BATTERY');
  console.log('======================================================\n');

  let completedUtterance = null;
  let bargeInTriggered = false;

  const engine = new MockAlwaysOnVoiceEngine({
    silenceDebounceMs: 200, // Speed up for unit testing
    onSpeechComplete: (text) => {
      completedUtterance = text;
    },
    onBargeIn: () => {
      bargeInTriggered = true;
    },
  });

  // TEST 1: Initial auto-start state
  engine.start();
  console.log(`[Test 1] Auto-Start: isListening=${engine.isListening} (${engine.isListening ? '✅ PASSED' : '❌ FAILED'})`);

  // TEST 2: VAD Silence Debounce (User speaks with short pauses, should NOT trigger until full silence)
  console.log('\n[Test 2] Simulating user speaking: "JARVIS" ... [50ms pause] ... "what is the weather in Malibu?"');
  engine.simulateSpeechChunk('JARVIS', true);
  await new Promise((r) => setTimeout(r, 50));
  engine.simulateSpeechChunk('what is the weather in Malibu?', true);

  // Before 200ms silence expires, completedUtterance should still be null
  const prematureTrigger = completedUtterance !== null;
  console.log(`  - Mid-speech premature trigger: ${prematureTrigger ? 'FAILED' : 'NONE (Correct)'}`);

  // Wait for VAD silence debounce to fire
  await new Promise((r) => setTimeout(r, 250));
  const vadPassed = completedUtterance === 'JARVIS what is the weather in Malibu?';
  console.log(`  - VAD Turn Finalized: "${completedUtterance}" (${vadPassed ? '✅ PASSED' : '❌ FAILED'})`);

  // TEST 3: Barge-In Interruption (User speaks while JARVIS is speaking TTS)
  console.log('\n[Test 3] Testing Barge-In Interruption while JARVIS TTS is speaking...');
  engine.isSpeaking = true;
  engine.simulateSpeechChunk('Stop JARVIS, calculate Mach 5 instead', true);
  const bargePassed = bargeInTriggered && !engine.isSpeaking;
  console.log(`  - TTS Cancelled & Barge-In Handled: (${bargePassed ? '✅ PASSED' : '❌ FAILED'})`);

  // Wait for new utterance to finish
  completedUtterance = null;
  await new Promise((r) => setTimeout(r, 250));
  const bargeUtterancePassed = completedUtterance === 'Stop JARVIS, calculate Mach 5 instead';
  console.log(`  - Interrupted Utterance Received: "${completedUtterance}" (${bargeUtterancePassed ? '✅ PASSED' : '❌ FAILED'})`);

  // TEST 4: Auto-Restart Loop on Browser Timeout (onend event)
  console.log('\n[Test 4] Simulating browser SpeechRecognition timeout (onend event)...');
  engine.simulateOnEnd();
  engine.simulateOnEnd();
  engine.simulateOnEnd();
  const restartPassed = engine.isListening && engine.restartsCount === 3;
  console.log(`  - Auto-Restart Count: ${engine.restartsCount}, Listening Active: ${engine.isListening} (${restartPassed ? '✅ PASSED' : '❌ FAILED'})`);

  // TEST 5: Mute / Unmute Sentinel Control
  console.log('\n[Test 5] Testing Audio Mute Toggle...');
  engine.toggleMute(); // Mute
  const mutedPassed = engine.isMuted && !engine.isListening;
  console.log(`  - Muted: isMuted=${engine.isMuted}, isListening=${engine.isListening} (${mutedPassed ? '✅ PASSED' : '❌ FAILED'})`);

  // Try speaking while muted (should be completely ignored)
  completedUtterance = null;
  engine.simulateSpeechChunk('Should be ignored', true);
  await new Promise((r) => setTimeout(r, 250));
  const ignoredPassed = completedUtterance === null;
  console.log(`  - Speech Ignored While Muted: (${ignoredPassed ? '✅ PASSED' : '❌ FAILED'})`);

  // Unmute
  engine.toggleMute();
  const unmutedPassed = !engine.isMuted && engine.isListening;
  console.log(`  - Unmuted: isMuted=${engine.isMuted}, isListening=${engine.isListening} (${unmutedPassed ? '✅ PASSED' : '❌ FAILED'})`);

  console.log('\n======================================================');
  const allPassed = vadPassed && bargePassed && bargeUtterancePassed && restartPassed && mutedPassed && ignoredPassed && unmutedPassed;
  if (allPassed) {
    console.log('⚡ ALL ALWAYS-ON VOICE TESTS PASSED (100% OPERATIONAL)');
  } else {
    console.log('⚠️ SOME TESTS FAILED');
  }
  console.log('======================================================\n');
}

runVoiceTests().catch((e) => console.error('Voice test runner error:', e));
