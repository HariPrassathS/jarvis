// ──────────────────────────────────────────────
// J.A.R.V.I.S Latency Tracker — Quantitative Voice Turn Pipeline Telemetry
// Measures precise performance.now() deltas across T0 -> T6:
// T0: Turn Complete (STT speech capture done)
// T1: sendMessage invoked
// T2: fetch fired to /api/chat/stream
// T3: First token received from SSE stream (Time to First Token / TTFT)
// T4: Stream complete (Server signaled done)
// T5: TTS starts speaking first sentence
// T6: Full audio response completed
// ──────────────────────────────────────────────

export interface LatencyCheckpoints {
  turnId: number;
  promptText: string;
  provider: string;
  t0: number; // STT speech captured
  t1: number; // sendMessage invoked
  t2: number; // fetch fired
  t3: number; // first token received
  t4: number; // stream done
  t5: number; // TTS first sentence audio started
  t6: number; // TTS all audio finished
}

class LatencyTracker {
  private currentTurn: LatencyCheckpoints | null = null;
  private turnCounter = 0;
  private history: LatencyCheckpoints[] = [];

  /**
   * T0: STT completed capturing user utterance
   */
  markT0(promptText: string): number {
    const t0 = performance.now();
    this.turnCounter += 1;
    this.currentTurn = {
      turnId: this.turnCounter,
      promptText: promptText.trim(),
      provider: 'unknown',
      t0,
      t1: 0,
      t2: 0,
      t3: 0,
      t4: 0,
      t5: 0,
      t6: 0,
    };

    console.log(`[Latency] ⏱️ [Turn #${this.turnCounter}] T0: Turn complete captured: "${promptText.slice(0, 40)}..." at ${t0.toFixed(1)}ms`);
    return t0;
  }

  /**
   * T1: sendMessage invoked
   */
  markT1(): number {
    const t1 = performance.now();
    if (!this.currentTurn) {
      this.turnCounter += 1;
      this.currentTurn = {
        turnId: this.turnCounter,
        promptText: 'Direct Text Input',
        provider: 'unknown',
        t0: t1,
        t1,
        t2: 0,
        t3: 0,
        t4: 0,
        t5: 0,
        t6: 0,
      };
    } else {
      this.currentTurn.t1 = t1;
    }

    const delta = (t1 - this.currentTurn.t0).toFixed(1);
    console.log(`[Latency] [Turn #${this.currentTurn.turnId}] T0->T1 (STT-to-sendMessage): ${delta}ms`);
    return t1;
  }

  /**
   * T2: fetch fired to /api/chat/stream
   */
  markT2(): number {
    const t2 = performance.now();
    if (!this.currentTurn) this.markT1();
    this.currentTurn!.t2 = t2;

    const t1ToT2 = (t2 - this.currentTurn!.t1).toFixed(1);
    const t0ToT2 = (t2 - this.currentTurn!.t0).toFixed(1);
    console.log(`[Latency] [Turn #${this.currentTurn!.turnId}] T1->T2 (sendMessage-to-fetch): ${t1ToT2}ms | T0->T2 (STT-to-fetch): ${t0ToT2}ms`);
    return t2;
  }

  /**
   * T3: First byte / token received from SSE stream (TTFT)
   */
  markT3(provider?: string): number {
    const t3 = performance.now();
    if (!this.currentTurn || this.currentTurn.t3 > 0) return t3; // only record first token once
    this.currentTurn.t3 = t3;
    if (provider) this.currentTurn.provider = provider;

    const ttft = (t3 - this.currentTurn.t2).toFixed(1);
    const totalToFirstToken = (t3 - this.currentTurn.t0).toFixed(1);
    console.log(
      `[Latency] ⚡ [Turn #${this.currentTurn.turnId}] T2->T3 (time-to-first-token / TTFT): ${ttft}ms | T0->T3: ${totalToFirstToken}ms [Provider: ${this.currentTurn.provider}]`
    );
    return t3;
  }

  /**
   * T4: Server signaled stream done
   */
  markT4(provider?: string): number {
    const t4 = performance.now();
    if (!this.currentTurn) return t4;
    this.currentTurn.t4 = t4;
    if (provider) this.currentTurn.provider = provider;

    const streamDuration = (t4 - this.currentTurn.t3).toFixed(1);
    const totalFetchToDone = (t4 - this.currentTurn.t2).toFixed(1);
    console.log(
      `[Latency] [Turn #${this.currentTurn.turnId}] T3->T4 (stream-duration): ${streamDuration}ms | T2->T4 (total-stream-time): ${totalFetchToDone}ms`
    );
    return t4;
  }

  /**
   * T5: TTS starts speaking the first sentence
   */
  markT5(firstSentence?: string): number {
    const t5 = performance.now();
    if (!this.currentTurn || this.currentTurn.t5 > 0) return t5; // record only for first sentence of turn
    this.currentTurn.t5 = t5;

    const firstTokenToSpeech = (t5 - (this.currentTurn.t3 || this.currentTurn.t2)).toFixed(1);
    const totalTimeToFirstSpokenWord = (t5 - this.currentTurn.t0).toFixed(1);

    console.log(
      `[Latency] 🗣️ [Turn #${this.currentTurn.turnId}] T3->T5 (first-token-to-speech): ${firstTokenToSpeech}ms | T0->T5 (total time-to-first-spoken-word): ${totalTimeToFirstSpokenWord}ms` +
      (firstSentence ? ` [Sentence: "${firstSentence.slice(0, 30)}..."]` : '')
    );
    return t5;
  }

  /**
   * T6: TTS full audio completed for all queued sentences
   */
  markT6(): number {
    const t6 = performance.now();
    if (!this.currentTurn) return t6;
    this.currentTurn.t6 = t6;

    const speechDuration = (t6 - (this.currentTurn.t5 || this.currentTurn.t4)).toFixed(1);
    const totalTurnLifecycle = (t6 - this.currentTurn.t0).toFixed(1);

    console.log(`[Latency] 🏁 [Turn #${this.currentTurn.turnId}] T5->T6 (speech-duration): ${speechDuration}ms | T0->T6 (total turn lifecycle): ${totalTurnLifecycle}ms`);
    
    this.printTurnSummary(this.currentTurn);
    this.history.push({ ...this.currentTurn });
    return t6;
  }

  /**
   * Print comprehensive quantitative latency breakdown table
   */
  private printTurnSummary(turn: LatencyCheckpoints): void {
    const t0ToT1 = turn.t1 > 0 ? (turn.t1 - turn.t0).toFixed(1) : '0';
    const t1ToT2 = turn.t2 > 0 && turn.t1 > 0 ? (turn.t2 - turn.t1).toFixed(1) : '0';
    const t0ToT2 = turn.t2 > 0 ? (turn.t2 - turn.t0).toFixed(1) : '0';
    const ttft = turn.t3 > 0 && turn.t2 > 0 ? (turn.t3 - turn.t2).toFixed(1) : '0';
    const streamDur = turn.t4 > 0 && turn.t3 > 0 ? (turn.t4 - turn.t3).toFixed(1) : '0';
    const tokenToSpeech = turn.t5 > 0 && turn.t3 > 0 ? (turn.t5 - turn.t3).toFixed(1) : '0';
    const totalToFirstWord = turn.t5 > 0 ? (turn.t5 - turn.t0).toFixed(1) : '0';
    const speechDur = turn.t6 > 0 && turn.t5 > 0 ? (turn.t6 - turn.t5).toFixed(1) : '0';
    const totalTurn = turn.t6 > 0 ? (turn.t6 - turn.t0).toFixed(1) : '0';

    console.log(
      `\n=======================================================\n` +
      `📊 QUANTITATIVE LATENCY BREAKDOWN (Turn #${turn.turnId})\n` +
      `Prompt: "${turn.promptText.slice(0, 50)}"\n` +
      `Provider: ${turn.provider}\n` +
      `-------------------------------------------------------\n` +
      `T0->T1 (STT to sendMessage):       ${t0ToT1.padStart(7)} ms\n` +
      `T1->T2 (sendMessage to fetch):     ${t1ToT2.padStart(7)} ms\n` +
      `T0->T2 (STT to fetch fired):       ${t0ToT2.padStart(7)} ms\n` +
      `T2->T3 (Time-to-First-Token TTFT): ${ttft.padStart(7)} ms ⭐\n` +
      `T3->T4 (LLM Stream Duration):      ${streamDur.padStart(7)} ms\n` +
      `T3->T5 (First Token to Speech):    ${tokenToSpeech.padStart(7)} ms\n` +
      `T0->T5 (TIME-TO-FIRST-SPOKEN-WORD):${totalToFirstWord.padStart(7)} ms 🎯\n` +
      `T5->T6 (Audio Speech Duration):    ${speechDur.padStart(7)} ms\n` +
      `T0->T6 (TOTAL TURN ROUNDTRIP):     ${totalTurn.padStart(7)} ms\n` +
      `=======================================================\n`
    );
  }

  getCurrentTurn(): LatencyCheckpoints | null {
    return this.currentTurn;
  }

  getHistory(): LatencyCheckpoints[] {
    return this.history;
  }
}

export const latencyTracker = new LatencyTracker();

if (typeof window !== 'undefined') {
  (window as any).__JARVIS_LATENCY_TRACKER__ = latencyTracker;
}
