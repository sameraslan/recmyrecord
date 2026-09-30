export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    // Release the probe context at once: browsers cap live WebGL contexts, and the map needs one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/* Runs in a worker. The first WebGL context of a browser session starts the GPU process's WebGL backend, and
 * with a software renderer that takes seconds, blocking whichever thread asked. The worker takes that wait
 * instead: it creates contexts (enabling the extensions three.js enables) until one comes back fast, which
 * means the GPU process has finished starting up, so the main thread's probe and renderer then cost a few ms. */
const WARM_UP_SOURCE = `
const EXTENSIONS = ['EXT_color_buffer_float', 'WEBGL_clip_cull_distance', 'OES_texture_float_linear',
  'EXT_color_buffer_half_float', 'WEBGL_multisampled_render_to_texture', 'WEBGL_render_shared_exponent'];
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
onmessage = async () => {
  try {
    for (let i = 0; i < 20; i++) {
      const ms = once();
      if (ms === null || ms < 30) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  } catch (e) {}
  postMessage(0);
};
`;

/** Starts the browser's WebGL backend off the main thread; resolves when it is ready, on failure, or after
 * `timeoutMs`. Never rejects. Where a worker cannot draw WebGL it resolves at once. */
export function warmUpWebGL(timeoutMs = 5000): Promise<void> {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve();
    };
    try {
      url = URL.createObjectURL(new Blob([WARM_UP_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = finish;
      worker.onerror = finish;
      timer = window.setTimeout(finish, timeoutMs);
      worker.postMessage(0);
    } catch {
      finish();
    }
  });
}
