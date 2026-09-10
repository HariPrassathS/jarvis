// ──────────────────────────────────────────────
// Tool: Computational & Math Engine
// Safe math & formula evaluation for JARVIS
// ──────────────────────────────────────────────

export function calculate(expression: string): string {
  try {
    // Sanitize mathematical expression — only allow digits, math operators, parentheses, and common math functions
    const sanitized = expression
      .replace(/\s+/g, '')
      .replace(/x/gi, '*')
      .replace(/\^/g, '**');

    // Reject dangerous syntax
    if (/[^0-9+\-*/().,%a-zA-Z_]/.test(sanitized)) {
      return `Error: Unsupported mathematical characters in "${expression}"`;
    }

    // Evaluate in safe Math context
    const mathContext = {
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      sqrt: Math.sqrt,
      cbrt: Math.cbrt,
      abs: Math.abs,
      log: Math.log,
      log10: Math.log10,
      exp: Math.exp,
      pi: Math.PI,
      PI: Math.PI,
      e: Math.E,
      E: Math.E,
      pow: Math.pow,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
    };

    const func = new Function(
      ...Object.keys(mathContext),
      `return (${sanitized});`
    );

    const result = func(...Object.values(mathContext));

    if (typeof result !== 'number' || isNaN(result)) {
      return `Computation failed for expression: ${expression}`;
    }

    return `Result of ${expression} = ${result.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return `Mathematical evaluation error: ${errorMsg}`;
  }
}
