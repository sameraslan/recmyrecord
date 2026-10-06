import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRenderer, isSoftwareRenderer, rendererName, softwareRenderer } from './renderer';

const M1 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)';
const SWIFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';

/** A graphics context that answers with `name`, with or without the extension that gives the real name. */
function context(name: string | null, { debugInfo = true, lost = false } = {}) {
  const getParameter = vi.fn((what: number) => (what === 0x9246 || what === 0x1f01 ? name : null));
  return {
    RENDERER: 0x1f01,
    getExtension: vi.fn((ext: string) => (debugInfo && ext === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null)),
    getParameter,
    isContextLost: () => lost,
  };
}

beforeEach(() => {
  forgetRenderer();
});

describe('isSoftwareRenderer', () => {
  it('knows the software renderers by name, and nothing else', () => {
    expect(isSoftwareRenderer(SWIFT)).toBe(true);
    expect(isSoftwareRenderer('Google SwiftShader')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
    expect(isSoftwareRenderer('Mesa Software Rasterizer')).toBe(true);
    expect(isSoftwareRenderer(M1)).toBe(false);
    expect(isSoftwareRenderer('Apple GPU')).toBe(false);
    expect(isSoftwareRenderer('')).toBe(false);
  });
});

describe('the renderer verdict, published on its own', () => {
  it('is unknown until a context has been asked', () => {
    expect(softwareRenderer()).toBeUndefined();
  });

  it('is asked of the context once, and then known to everyone without another question', () => {
    const gpu = context(M1);
    expect(rendererName(gpu)).toBe(M1);
    expect(softwareRenderer()).toBe(false);
    expect(rendererName(gpu)).toBe(M1);
    expect(gpu.getParameter).toHaveBeenCalledTimes(1);
  });

  it('says software for a software renderer', () => {
    rendererName(context(SWIFT));
    expect(softwareRenderer()).toBe(true);
  });

  it('falls back to the masked name where the extension is missing', () => {
    expect(rendererName(context('WebKit WebGL', { debugInfo: false }))).toBe('WebKit WebGL');
    expect(softwareRenderer()).toBe(false);
  });

  it('asks again for another context (a map mounted anew, or a context restored on another renderer)', () => {
    rendererName(context(M1));
    const second = context(SWIFT);
    expect(rendererName(second)).toBe(SWIFT);
    expect(softwareRenderer()).toBe(true);
    expect(second.getParameter).toHaveBeenCalledTimes(1);
  });

  it('stays unknown when the context is lost or gives no name: no answer is not "a GPU"', () => {
    const lost = context(M1, { lost: true });
    expect(rendererName(lost)).toBe('');
    expect(lost.getParameter).not.toHaveBeenCalled();
    expect(softwareRenderer()).toBeUndefined();
    expect(rendererName(context(null))).toBe('');
    expect(softwareRenderer()).toBeUndefined();
  });
});
