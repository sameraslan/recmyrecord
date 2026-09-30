import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmUpWebGL } from './webgl';

type Handler = ((e: unknown) => void) | null;

class FakeWorker {
  static last: FakeWorker | null = null;
  static answer: 'message' | 'error' | 'never' = 'message';
  onmessage: Handler = null;
  onerror: Handler = null;
  terminated = false;
  constructor(public url: string) {
    FakeWorker.last = this;
  }
  postMessage() {
    if (FakeWorker.answer === 'message') queueMicrotask(() => this.onmessage?.({ data: { ok: true } }));
    if (FakeWorker.answer === 'error') queueMicrotask(() => this.onerror?.(new Event('error')));
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
  FakeWorker.answer = 'message';
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
    void warmUpWebGL(1000).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    expect(FakeWorker.last?.terminated).toBe(true);
  });
});
