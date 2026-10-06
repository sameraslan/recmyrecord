/** Which renderer draws the map: a real GPU or a software one (the CPU shades every pixel). Asked of the map's
 * graphics context once and kept here, apart from anything that is chosen because of it, so the gas (which
 * shader, whether the sharper image) and the star glints (state/twinkle.ts) read the same answer and neither
 * depends on the other. The question needs an answer from the GPU process and blocks until the renderer has
 * drawn what is queued, so callers ask only when that is cheap: behind the gas layer's fence, or on a quiet map. */

/** True when the renderer's name is a software renderer's. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/** The part of a WebGL context this needs. */
export interface RendererContext {
  RENDERER: number;
  getExtension: (name: 'WEBGL_debug_renderer_info') => { UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter: (what: number) => unknown;
  isContextLost: () => boolean;
}

let askedOf: object | null = null;
let name: string | null = null;

/** The renderer's name, asked once per context. '' when the context is lost or gives none: that is not kept, so
 * the verdict stays unknown and a later call asks again. */
export function rendererName(ctx: RendererContext): string {
  if (askedOf === ctx && name !== null) return name;
  askedOf = null;
  name = null;
  if (ctx.isContextLost()) return '';
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  const got = ctx.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : ctx.RENDERER);
  if (typeof got !== 'string' || got === '') return '';
  askedOf = ctx;
  name = got;
  return got;
}

/** True on a software renderer, false on a GPU, undefined while no context has answered. */
export function softwareRenderer(): boolean | undefined {
  return name === null ? undefined : isSoftwareRenderer(name);
}

/** Back to unknown (the map's context is gone; tests). */
export function forgetRenderer(): void {
  askedOf = null;
  name = null;
}
