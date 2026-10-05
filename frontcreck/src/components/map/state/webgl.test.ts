import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebGLAvailable, WARM_UP_SOURCE, warmUpDone, warmUpWebGL } from './webgl';

type Handler = ((e: unknown) => void) | null;

class FakeWorker {
  static last: FakeWorker | null = null;
  /** What the fake posts back when started: both phases, only the first context, an error, or nothing. */
  static answer: 'done' | 'first' | 'error' | 'never' = 'done';
  onmessage: Handler = null;
  onerror: Handler = null;
  terminated = false;
  constructor(public url: string) {
    FakeWorker.last = this;
  }
  postMessage() {
    const a = FakeWorker.answer;
    if (a === 'done' || a === 'first') queueMicrotask(() => this.onmessage?.({ data: 'first' }));
    if (a === 'done') queueMicrotask(() => this.onmessage?.({ data: 'done' }));
    if (a === 'error') queueMicrotask(() => this.onerror?.(new Event('error')));
  }
  terminate() {
    this.terminated = true;
  }
}

function install() {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('OffscreenCanvas', class {});
  URL.createObjectURL = vi.fn(() => 'blob:warm');
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeWorker.last = null;
  FakeWorker.answer = 'done';
});

describe('warmUpDone', () => {
  it('keeps going after the first context, however fast', () => {
    expect(warmUpDone([])).toBe(false);
    expect(warmUpDone([2000])).toBe(false);
    expect(warmUpDone([10])).toBe(false);
  });

  it('stops once a later creation takes under 30 ms', () => {
    expect(warmUpDone([2000, 600])).toBe(false);
    expect(warmUpDone([2000, 600, 120, 100])).toBe(false);
    expect(warmUpDone([2000, 600, 120, 100, 11])).toBe(true);
    expect(warmUpDone([42, 4])).toBe(true);
  });

  it('stops after maxContexts where creation never gets fast', () => {
    expect(warmUpDone([200, 200, 200], 3)).toBe(true);
    expect(warmUpDone(Array(7).fill(45))).toBe(false);
    expect(warmUpDone(Array(8).fill(45))).toBe(true);
  });
});

/** Runs the worker source in a fake worker scope whose context creations take the given times. */
function runWorkerSource(times: (number | null)[]) {
  let clock = 0;
  let created = 0;
  const posted: unknown[] = [];
  const scope: { onmessage: ((e: unknown) => void) | null; postMessage: (m: unknown) => void } = {
    onmessage: null,
    postMessage: (m) => posted.push(m),
  };
  class Canvas {
    getContext() {
      const ms = times[created++];
      if (ms === null || ms === undefined) return null;
      clock += ms;
      return { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext() {} } : null) };
    }
  }
  const performance = { now: () => clock };
  new Function('self', 'OffscreenCanvas', 'performance', WARM_UP_SOURCE)(scope, Canvas, performance);
  scope.onmessage?.({ data: 0 });
  return { posted, created };
}

describe('the warm-up worker', () => {
  it('reports its first context, then stops once a creation is fast (SwiftShader)', () => {
    const { posted, created } = runWorkerSource([2000, 600, 120, 100, 11, 10]);
    expect(posted).toEqual(['first', 'done']);
    expect(created).toBe(5);
  });

  it('stops after the second context on Metal', () => {
    const { posted, created } = runWorkerSource([42, 4, 3, 3]);
    expect(posted).toEqual(['first', 'done']);
    expect(created).toBe(2);
  });

  it('stops after eight contexts on a GPU whose creations stay at 30 ms or more', () => {
    const { posted, created } = runWorkerSource(Array(20).fill(45));
    expect(posted).toEqual(['first', 'done']);
    expect(created).toBe(8);
  });

  it('stops after eight contexts where creation stays slow', () => {
    const { posted, created } = runWorkerSource(Array(20).fill(200));
    expect(posted).toEqual(['first', 'done']);
    expect(created).toBe(8);
  });

  it('reports done at once when a worker has no WebGL', () => {
    const { posted } = runWorkerSource([null, null]);
    expect(posted).toEqual(['done']);
  });
});

describe('warmUpWebGL', () => {
  it('resolves at once where workers cannot draw WebGL', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    await expect(warmUpWebGL()).resolves.toBeUndefined();
  });

  it('resolves when the worker reports and then stops it', async () => {
    install();
    await warmUpWebGL();
    expect(FakeWorker.last?.terminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:warm');
  });

  it('resolves when the worker fails', async () => {
    install();
    FakeWorker.answer = 'error';
    await warmUpWebGL();
    expect(FakeWorker.last?.terminated).toBe(true);
  });

  it('gives up on a worker that never answers', async () => {
    install();
    vi.useFakeTimers();
    FakeWorker.answer = 'never';
    const done = vi.fn();
    void warmUpWebGL({ timeoutMs: 1000 }).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    expect(FakeWorker.last?.terminated).toBe(true);
  });

  it('caps the wait after the first context at capMs', async () => {
    install();
    vi.useFakeTimers();
    FakeWorker.answer = 'first';
    const done = vi.fn();
    void warmUpWebGL({ capMs: 1000 }).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    expect(FakeWorker.last?.terminated).toBe(true);
  });

  it('stops the worker and resolves when aborted', async () => {
    install();
    FakeWorker.answer = 'never';
    const ac = new AbortController();
    const p = warmUpWebGL({ signal: ac.signal });
    ac.abort();
    await expect(p).resolves.toBeUndefined();
    expect(FakeWorker.last?.terminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:warm');
  });

  it('never starts a worker for a signal that is already aborted', async () => {
    install();
    const ac = new AbortController();
    ac.abort();
    await warmUpWebGL({ signal: ac.signal });
    expect(FakeWorker.last).toBeNull();
  });
});

describe('isWebGLAvailable', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Stubs canvas.getContext to return a context only for the given types. */
  function stubContexts(types: string[]) {
    const lose = vi.fn();
    const gl = { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext: lose } : null) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      types.includes(type) ? gl : null) as unknown as HTMLCanvasElement['getContext']);
    return lose;
  }

  it('is true with WebGL2, and releases the probe context', () => {
    const lose = stubContexts(['webgl2', 'webgl']);
    expect(isWebGLAvailable()).toBe(true);
    expect(lose).toHaveBeenCalledOnce();
  });

  it('is false with only WebGL1, which three.js cannot render with', () => {
    stubContexts(['webgl']);
    expect(isWebGLAvailable()).toBe(false);
  });

  it('is false with no WebGL, or when getContext throws', () => {
    stubContexts([]);
    expect(isWebGLAvailable()).toBe(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isWebGLAvailable()).toBe(false);
  });
});
