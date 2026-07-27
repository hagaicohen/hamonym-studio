// Shared across all agents — not general logging, just "which step ran,
// how long did it take, did it fail, and what did it actually return." Every
// tool call, the prompt build, and the LLM call each get one line, so once
// there are 10 tools a slow/failed/empty run points straight at the culprit
// instead of a blank wait.
function createTracer(label) {
  const steps = [];

  // describe(result) is optional — returns a small object of counts/status
  // worth seeing at a glance (e.g. { documents: 2, hasData: 2 }), not the
  // full payload.
  const trace = async (name, fn, describe) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      const meta = describe ? describe(result) : undefined;
      steps.push({ tool: name, durationMs: Date.now() - t0, success: true, meta });
      return result;
    } catch (err) {
      steps.push({ tool: name, durationMs: Date.now() - t0, success: false, error: err.message });
      throw err;
    }
  };

  const print = () => {
    const total = steps.reduce((sum, s) => sum + s.durationMs, 0);
    console.log(label);
    for (const s of steps) {
      const mark = s.success ? '✓' : '✗';
      const metaStr = s.meta ? ' — ' + Object.entries(s.meta).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      const errStr = s.success ? '' : ` — ${s.error}`;
      console.log(`${mark} ${s.tool} (${s.durationMs}ms)${metaStr}${errStr}`);
    }
    console.log(`Total: ${total}ms`);
  };

  return { trace, steps, print };
}

module.exports = { createTracer };
