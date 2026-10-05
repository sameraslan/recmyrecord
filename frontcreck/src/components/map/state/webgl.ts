/** WebGL2 only: three.js's WebGLRenderer asks for a webgl2 context and throws without one, so a browser with
 * just WebGL1 gets the no-WebGL message instead of a renderer that takes the page down. */
export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    // Release the probe context at once: browsers cap live WebGL contexts, and the map needs one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * The warm-up loop's stop rule, given each context creation's time in ms (oldest first). A creation after
 * the first that takes under 30 ms means the backend is warm, so the main thread's probe and renderer will
 * not block on it. It stops after `maxContexts` contexts in any case, for GPUs where creation never gets
 * that fast (warmUpWebGL also caps the time). Self-contained: the worker source embeds it as text.
 */
export function warmUpDone(times: readonly number[], maxContexts = 8): boolean {
  const n = times.length;
  return (n > 1 && times[n - 1] < 30) || n >= maxContexts;
}

/* Runs in a worker. The first WebGL context of a browser session starts the GPU process's WebGL backend, and
 * with a software renderer that takes seconds, blocking whichever thread asked. The worker takes that wait
 * instead: it creates contexts back to back (enabling the extensions three.js enables) until warmUpDone says
 * the backend is warm. Measured in headless Chrome on an Apple M1 Pro: with SwiftShader, creations took about
 * 2000, 600, 120, 100 and 11 ms (stopping after the second left a main-thread long task of about 100 ms);
 * with Metal, about 42 then 4 ms, about 110 ms in all with the worker's start. It posts 'first' after the
 * first context and 'done' when it stops. Exported for tests. */
export const WARM_UP_SOURCE = `
const EXTENSIONS = ['EXT_color_buffer_float', 'WEBGL_clip_cull_distance', 'OES_texture_float_linear',
  'EXT_color_buffer_half_float', 'WEBGL_multisampled_render_to_texture', 'WEBGL_render_shared_exponent'];
const done = (${warmUpDone.toString()});
function once() {
  const t = performance.now();
  const c = new OffscreenCanvas(1, 1);
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return null;
  for (const e of EXTENSIONS) gl.getExtension(e);
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return performance.now() - t;
}
self.onmessage = () => {
  try {
    const times = [];
    for (;;) {
      const ms = once();
      if (ms === null) break;
      times.push(ms);
      if (times.length === 1) self.postMessage('first');
      if (done(times)) break;
    }
  } catch (e) {}
  self.postMessage('done');
};
`;

export interface WarmUpOptions {
  /** Aborting stops the worker and resolves at once (MapStage aborts on unmount). */
  signal?: AbortSignal;
  /** Longest wait after the first context has come back. */
  capMs?: number;
  /** Longest wait for a worker that never reports its first context. */
  timeoutMs?: number;
}

/**
 * Starts the browser's WebGL backend off the main thread; resolves when it is ready, on failure, on abort,
 * `capMs` after the first context came back, or `timeoutMs` after the start if no context ever came back.
 * Never rejects. Where a worker cannot draw WebGL it resolves at once.
 *
 * The cap counts from the first context, not from the start: until the first context comes back the GPU
 * process is still starting its backend, and resolving then would only move that wait (about 2 s with
 * SwiftShader) onto the main thread's probe, without drawing the map any sooner.
 */
export function warmUpWebGL({ signal, capMs = 1000, timeoutMs = 5000 }: WarmUpOptions = {}): Promise<void> {
  if (
    signal?.aborted ||
    typeof Worker !== 'function' ||
    typeof OffscreenCanvas !== 'function' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    let timer = 0;
    let finished = false;
    const finish = (why: string) => {
      if (finished) return;
      finished = true;
      // Read by the perf script: when and why the warm-up ended.
      performance.mark?.('rmr-webgl-warm', { detail: why });
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve();
    };
    const onAbort = () => finish('abort');
    try {
      signal?.addEventListener('abort', onAbort);
      url = URL.createObjectURL(new Blob([WARM_UP_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (e: MessageEvent) => {
        if (e.data !== 'first') return finish('done');
        window.clearTimeout(timer);
        timer = window.setTimeout(() => finish('cap'), capMs);
      };
      worker.onerror = () => finish('error');
      timer = window.setTimeout(() => finish('timeout'), timeoutMs);
      worker.postMessage(0);
    } catch {
      finish('error');
    }
  });
}
