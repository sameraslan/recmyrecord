import { act, cleanup, renderHook } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({ useFrame: vi.fn(), useThree: vi.fn() }));

import { useFrame, useThree } from "@react-three/fiber";
import { ATLAS_PER_SHEET } from "@/lib/data/sprites";
import type { MapData } from "../data";
import { DEFAULT_INPUT, useMapStore } from "../state/mapStore";
import { ATLAS_LOAD_PX, zoomForCoverPx } from "../state/zoomLimits";
import { RECHECK_MS, UPLOAD_BANDS, countVisibleSpritesByAtlas, isAtlasSheetLoaded, uploadAtlas, useAtlasTextures } from "./AtlasManager";

/**
 * The atlas queue against a fake renderer: which sheets are requested and when, and what a lost or restored
 * WebGL context does to a sheet in flight. No GPU is involved; the real upload is covered by the map e2e.
 */
const H = 836;
const NEAR = zoomForCoverPx(ATLAS_LOAD_PX, H) * 2; // zoomed in: covers show
const FAR = zoomForCoverPx(ATLAS_LOAD_PX, H) / 2; // the overview: dots only
const AWAY = 1000; // world units: never in view from the origin

let raf: FrameRequestCallback[] = [];
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
/** Runs the animation frame that is due (one upload band), and what follows from it. */
const tick = async () => {
  const due = raf;
  raf = [];
  due.forEach((f) => f(0));
  await flush();
};

interface Copy { y0: number; y1: number; mipmaps: boolean }
function fakeRenderer() {
  let lost = false;
  const inits: { generateMipmaps: boolean; levels: number; dataReady: boolean }[] = [];
  const copies: Copy[] = [];
  const renderer = {
    domElement: document.createElement("canvas"),
    initTexture: vi.fn((tex: THREE.Texture) => {
      inits.push({ generateMipmaps: tex.generateMipmaps, levels: tex.mipmaps?.length ?? 0, dataReady: tex.source.dataReady });
    }),
    copyTextureToTexture: vi.fn((_src: THREE.Texture, dst: THREE.Texture, region: THREE.Box2) => {
      copies.push({ y0: region.min.y, y1: region.max.y, mipmaps: dst.generateMipmaps });
    }),
    getContext: () => ({ isContextLost: () => lost }),
  };
  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    canvas: renderer.domElement,
    inits,
    copies,
    setLost: (v: boolean) => {
      lost = v;
    },
  };
}

const bitmap = (size = 3072) => ({ width: size, height: size, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  raf = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => raf.push(cb));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useMapStore.setState({ input: DEFAULT_INPUT });
});

describe("uploading a decoded sheet", () => {
  it("allocates storage for every mipmap level without building mipmaps from nothing, then builds them once", async () => {
    const f = fakeRenderer();
    const bmp = bitmap();
    const done = uploadAtlas(f.renderer, bmp, () => true);
    await flush();
    expect(f.inits).toEqual([{ generateMipmaps: false, levels: 12, dataReady: false }]);
    expect(f.copies).toEqual([]); // nothing is copied outside an animation frame
    for (let i = 0; i < UPLOAD_BANDS; i++) {
      expect(f.copies).toHaveLength(i);
      await tick();
    }
    const tex = (await done)!;
    expect(f.copies).toEqual([
      { y0: 0, y1: 768, mipmaps: false },
      { y0: 768, y1: 1536, mipmaps: false },
      { y0: 1536, y1: 2304, mipmaps: false },
      { y0: 2304, y1: 3072, mipmaps: true },
    ]);
    // The texture the shader gets is what it was before the upload came in bands.
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.mipmaps).toEqual([]);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.flipY).toBe(false);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
    expect(tex.format).toBe(THREE.RGBAFormat);
    expect(tex.type).toBe(THREE.UnsignedByteType);
    expect((tex.image as { width: number; height: number }).width).toBe(3072);
    expect(f.renderer.initTexture).toHaveBeenCalledTimes(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
  });

  it("allocates nothing for a load that is no longer wanted when its image arrives", async () => {
    const f = fakeRenderer();
    const bmp = bitmap();
    expect(await uploadAtlas(f.renderer, bmp, () => false)).toBeNull();
    expect(f.renderer.initTexture).not.toHaveBeenCalled();
    expect(bmp.close).toHaveBeenCalledTimes(1);

    f.setLost(true);
    const other = bitmap();
    expect(await uploadAtlas(f.renderer, other, () => true)).toBeNull();
    expect(f.renderer.initTexture).not.toHaveBeenCalled();
    expect(other.close).toHaveBeenCalledTimes(1);
    expect(raf).toHaveLength(0);
  });

  it("resolves null and releases everything when the context is lost between two bands", async () => {
    const f = fakeRenderer();
    const bmp = bitmap();
    const dispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const done = uploadAtlas(f.renderer, bmp, () => true);
    await tick();
    await tick();
    expect(f.copies).toHaveLength(2);
    f.setLost(true); // no event yet: the context itself says so
    await tick();
    expect(await done).toBeNull();
    expect(f.copies).toHaveLength(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
    expect(raf).toHaveLength(0);
  });

  it("resolves null when its epoch ends between two bands", async () => {
    const f = fakeRenderer();
    const bmp = bitmap();
    let current = true;
    const done = uploadAtlas(f.renderer, bmp, () => current);
    await tick();
    current = false;
    await tick();
    expect(await done).toBeNull();
    expect(f.copies).toHaveLength(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
  });

  it("releases the texture and the image when a copy throws", async () => {
    const f = fakeRenderer();
    const bmp = bitmap();
    const dispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    vi.mocked(f.renderer.copyTextureToTexture).mockImplementation(() => {
      throw new Error("copy failed");
    });
    const done = uploadAtlas(f.renderer, bmp, () => true);
    const settled = done.catch((e: Error) => e.message);
    await tick();
    expect(await settled).toBe("copy failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
  });
});

describe("counting the albums on screen per sheet", () => {
  const n = 5000;
  const sheets = 5;
  const sheetOf = new Int16Array(n);
  const positions = new Float32Array(n * 2);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    sheetOf[i] = i % (sheets + 1); // one sheet more than is counted: it is ignored
    positions[i * 2] = rand();
    positions[i * 2 + 1] = rand();
  }
  /** What the shader draws inside the canvas: Vector3.project with the camera's matrices up to date. */
  const projected = (camera: THREE.OrthographicCamera) => {
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const expected = new Array(sheets).fill(0);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(positions[i * 2], positions[i * 2 + 1], 0).project(camera);
      if (sheetOf[i] < sheets && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) expected[sheetOf[i]]++;
    }
    return expected;
  };
  const counted = (camera: THREE.OrthographicCamera) => {
    const counts = new Int32Array(sheets).fill(99);
    countVisibleSpritesByAtlas(sheetOf, positions, camera, counts);
    return [...counts];
  };

  it("counts what the camera projects inside the canvas, with and without the album panel's view offset", () => {
    const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, 0.1, 100);
    camera.position.set(0.31, -0.22, 5);
    camera.zoom = 3.7;
    const plain = projected(camera);
    expect(counted(camera)).toEqual(plain);
    expect(plain.every((c) => c > 0 && c < n / sheets)).toBe(true); // the view cuts through the cloud
    camera.setViewOffset(1440, 900, -324, 0, 1440, 900); // applyFrustum (InitialFrame.tsx) with a 648 px panel
    const offset = projected(camera);
    expect(counted(camera)).toEqual(offset);
    expect(offset).not.toEqual(plain);
  });

  it("reads the camera as it is now, not as it was when the last frame was drawn", () => {
    const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.zoom = 1;
    const before = projected(camera); // matrices up to date at the overview
    // A jump, with no frame drawn since: the matrices still describe the overview.
    camera.position.set(0.6, 0.5, 5);
    camera.zoom = 6;
    const now = counted(camera);
    expect(now).not.toEqual(before);
    expect(now).toEqual(projected(camera));
  });

  it("counts nothing while the positions are not there", () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const counts = new Int32Array(sheets).fill(99);
    countVisibleSpritesByAtlas(sheetOf, new Float32Array(0), camera, counts);
    expect([...counts]).toEqual([0, 0, 0, 0, 0]);
  });
});

/** Where the albums of each sheet are: `at[s]` is [x, y] for the whole sheet, or a function of the album's place on it. */
type Place = [number, number] | ((cell: number) => [number, number]);

function mountQueue(at: Place[], zoom = NEAR) {
  const sheets = at.length;
  const n = sheets * ATLAS_PER_SHEET;
  const positions = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const place = at[Math.floor(i / ATLAS_PER_SHEET)];
    const [x, y] = typeof place === "function" ? place(i % ATLAS_PER_SHEET) : place;
    positions[i * 2] = x;
    positions[i * 2 + 1] = y;
  }
  const data = { n, albums: [], pos: {}, atlasUrls: Array.from({ length: sheets }, (_, i) => `/data/atlas-${i}.webp`) } as unknown as MapData;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 5);
  // The camera's matrices are deliberately left alone: the queue must see the camera as it is now.
  const look = (x: number, y: number, z: number) => {
    camera.position.set(x, y, 5);
    camera.zoom = z;
  };
  look(0, 0, zoom);
  const f = fakeRenderer();
  const three = { camera, gl: f.renderer, get: () => ({ size: { height: H } }) };
  vi.mocked(useThree).mockImplementation(((select: (s: typeof three) => unknown) => select(three)) as never);
  let onFrame: (state: { size: { height: number } }, delta: number) => void = () => {};
  vi.mocked(useFrame).mockImplementation(((cb: typeof onFrame) => {
    onFrame = cb;
  }) as never);
  const requests: { url: string; load: (b: ImageBitmap) => void; fail: (e: unknown) => void }[] = [];
  vi.spyOn(THREE.ImageBitmapLoader.prototype, "load").mockImplementation(((url: string, load: (b: ImageBitmap) => void, _p: unknown, fail: (e: unknown) => void) => {
    requests.push({ url, load, fail });
  }) as never);
  const positionsRef = { current: positions };
  const hook = renderHook(() => useAtlasTextures(data, positionsRef));
  const sheetOfRequest = (r: { url: string }) => Number(/atlas-(\d+)\.webp$/.exec(r.url)![1]);
  return {
    ...f,
    hook,
    look,
    requests,
    requested: () => requests.map(sheetOfRequest),
    /** A frame the map draws. */
    frame: () => act(() => onFrame({ size: { height: H } }, 0.016)),
    /** The image of request `i` arrives and is uploaded, band by band. */
    deliver: async (i: number, bands = UPLOAD_BANDS) => {
      const bmp = bitmap();
      await act(async () => {
        requests[i].load(bmp);
        await flush();
        for (let b = 0; b < bands; b++) await tick();
      });
      return bmp;
    },
    textures: () => hook.result.current.map((t) => t !== null),
  };
}

const HERE: Place = [0, 0];
const THERE: Place = [AWAY, 0];
const event = (type: string) => new Event(type, { cancelable: true });

describe("the atlas queue: which sheets load, and when", () => {
  it("starts when covers are about to show, loads one sheet at a time, pauses zoomed out and resumes", async () => {
    // Sheet 2 has more albums on screen than sheet 1.
    const q = mountQueue([HERE, (cell) => (cell < 300 ? [0, 0] : [AWAY, 0]), HERE], FAR);
    q.frame();
    q.frame();
    expect(q.requested()).toEqual([]);

    q.look(0, 0, NEAR);
    q.frame();
    expect(q.requested()).toEqual([0]); // atlas-0 first
    q.frame();
    q.frame();
    expect(q.requested()).toEqual([0]); // one at a time
    expect(q.textures()).toEqual([false, false, false]);

    await q.deliver(0);
    expect(q.textures()).toEqual([true, false, false]);
    expect(isAtlasSheetLoaded(0)).toBe(true);
    expect(q.requested()).toEqual([0, 2]); // then the sheet with the most albums on screen

    q.look(0, 0, FAR);
    await q.deliver(1);
    expect(q.textures()).toEqual([true, false, true]);
    expect(q.requested()).toEqual([0, 2]); // zoomed out: the queue waits
    q.frame();
    expect(q.requested()).toEqual([0, 2]);

    q.look(0, 0, NEAR);
    q.frame();
    expect(q.requested()).toEqual([0, 2, 1]);
    await q.deliver(2);
    expect(q.textures()).toEqual([true, true, true]);
    q.frame();
    expect(q.requested()).toEqual([0, 2, 1]);
  });

  it("does not load a sheet with no album on screen, and loads it once one comes into view", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const q = mountQueue([HERE, HERE, [AWAY, 0], [0, AWAY]]);
    q.frame();
    await q.deliver(0);
    await q.deliver(1);
    expect(q.requested()).toEqual([0, 1]);
    expect(q.textures()).toEqual([true, true, false, false]);

    // Frames with the camera where it was (a hover, say): a look after each at most, and nothing to load.
    q.frame();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10 * RECHECK_MS);
    q.frame();
    vi.advanceTimersByTime(10 * RECHECK_MS);
    expect(q.requested()).toEqual([0, 1]);
    expect(vi.getTimerCount()).toBe(0); // and none without a frame: an idle map does nothing

    // The camera reaches sheet 3's albums: seen right after the frame (the last look is old), not inside it.
    q.look(0, AWAY, NEAR);
    q.frame();
    expect(q.requested()).toEqual([0, 1]);
    vi.advanceTimersByTime(1);
    expect(q.requested()).toEqual([0, 1, 3]);
    await q.deliver(2);
    expect(q.textures()).toEqual([true, true, false, true]);
    expect(q.requested()).toEqual([0, 1, 3]); // sheet 2 is still out of view

    // Sheet 2's albums come into view right after a look, and the camera stops: however many frames there
    // were, one look is due, RECHECK_MS after the last.
    q.look(AWAY, 0, NEAR);
    q.frame();
    q.frame();
    q.frame();
    expect(q.requested()).toEqual([0, 1, 3]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(RECHECK_MS - 1);
    expect(q.requested()).toEqual([0, 1, 3]);
    vi.advanceTimersByTime(1);
    expect(q.requested()).toEqual([0, 1, 3, 2]);
    await q.deliver(3);
    expect(q.textures()).toEqual([true, true, true, true]);
    q.frame();
    expect(vi.getTimerCount()).toBe(0); // every sheet is loaded: frames cost nothing
  });

  it("looks once more after the frame that starts the queue with nothing in view (a jump the frame has not drawn yet)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const q = mountQueue([THERE, THERE], FAR);
    q.look(0, 0, NEAR);
    q.frame(); // zoomed in, nothing on screen
    expect(q.requested()).toEqual([]);
    q.look(AWAY, 0, NEAR); // the camera lands on the albums, and no further frame is drawn
    vi.advanceTimersByTime(RECHECK_MS);
    expect(q.requested()).toEqual([0]);
  });

  it("starts with the sheet in view when atlas-0 has nothing on screen", async () => {
    const q = mountQueue([THERE, HERE, THERE]);
    q.frame();
    expect(q.requested()).toEqual([1]);
    await q.deliver(0);
    expect(q.requested()).toEqual([1]);
    expect(q.textures()).toEqual([false, true, false]);
  });

  it("always loads the sheet of the album picked in Explore, wherever that album is", async () => {
    const q = mountQueue([HERE, THERE, THERE]);
    useMapStore.setState({ input: { ...DEFAULT_INPUT, selected: 2 * ATLAS_PER_SHEET + 5 } });
    q.frame();
    await q.deliver(0);
    expect(q.requested()).toEqual([0, 2]);
    await q.deliver(1);
    expect(q.textures()).toEqual([true, false, true]);
    expect(q.requested()).toEqual([0, 2]);
  });

  it("does not load a sheet for the selection of an album view, whose covers are not drawn from the atlas", async () => {
    const q = mountQueue([HERE, THERE]);
    useMapStore.setState({ input: { ...DEFAULT_INPUT, selected: ATLAS_PER_SHEET + 5, focus: { seed: 3, recs: [] } } });
    q.frame();
    await q.deliver(0);
    expect(q.requested()).toEqual([0]);
  });

  it("skips a sheet whose request fails, and goes on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const q = mountQueue([HERE, HERE]);
    q.frame();
    await act(async () => {
      q.requests[0].fail(new Error("404"));
      await flush();
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(q.requested()).toEqual([0, 1]);
    await q.deliver(1);
    expect(q.textures()).toEqual([false, true]);
    q.frame();
    expect(q.requested()).toEqual([0, 1]);
  });
});

describe("the atlas queue and a lost WebGL context", () => {
  it("commits nothing from a sheet whose upload the loss interrupts, and requests nothing while lost", async () => {
    const q = mountQueue([HERE, HERE]);
    q.frame();
    const bmp = await q.deliver(0, 2); // two of four bands
    expect(q.copies).toHaveLength(2);
    q.setLost(true);
    act(() => void q.canvas.dispatchEvent(event("webglcontextlost")));
    await act(tick);
    await act(tick);
    expect(q.copies).toHaveLength(2);
    expect(q.textures()).toEqual([false, false]);
    expect(isAtlasSheetLoaded(0)).toBe(false);
    expect(bmp.close).toHaveBeenCalledTimes(1);
    q.frame();
    expect(q.requested()).toEqual([0]);
  });

  it("does the same when the context is lost before its event arrives", async () => {
    const q = mountQueue([HERE, HERE]);
    q.frame();
    await q.deliver(0, 1);
    q.setLost(true);
    await act(tick);
    expect(q.copies).toHaveLength(1);
    expect(q.textures()).toEqual([false, false]);
    q.frame();
    expect(q.requested()).toEqual([0]); // no new request on a lost context
  });

  it("does not take a request that fails after the loss for a bad sheet: the restored context fetches it again", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const q = mountQueue([HERE, HERE]);
    q.frame();
    expect(q.requested()).toEqual([0]);
    q.setLost(true);
    act(() => void q.canvas.dispatchEvent(event("webglcontextlost")));
    q.setLost(false);
    act(() => void q.canvas.dispatchEvent(event("webglcontextrestored")));
    // The request of the old context fails only now.
    await act(async () => {
      q.requests[0].fail(new Error("aborted"));
      await flush();
    });
    expect(error).not.toHaveBeenCalled();
    q.frame();
    expect(q.requested()).toEqual([0, 0]);
    await q.deliver(1);
    expect(q.textures()).toEqual([true, false]);
    expect(q.requested()).toEqual([0, 0, 1]);
  });

  it("loads every sheet again after a restore, and releases the dead textures", async () => {
    const q = mountQueue([HERE, HERE]);
    q.frame();
    await q.deliver(0);
    await q.deliver(1);
    expect(q.textures()).toEqual([true, true]);
    const dead = q.hook.result.current.map((t) => vi.spyOn(t!, "dispose"));
    q.frame();
    expect(q.requested()).toEqual([0, 1]);

    q.setLost(true);
    act(() => void q.canvas.dispatchEvent(event("webglcontextlost")));
    q.frame();
    expect(q.requested()).toEqual([0, 1]);
    q.setLost(false);
    act(() => void q.canvas.dispatchEvent(event("webglcontextrestored")));
    expect(q.textures()).toEqual([false, false]);
    expect(isAtlasSheetLoaded(0)).toBe(false);
    expect(isAtlasSheetLoaded(1)).toBe(false);
    for (const d of dead) expect(d).toHaveBeenCalledTimes(1);

    q.frame();
    expect(q.requested()).toEqual([0, 1, 0]);
    await q.deliver(2);
    await q.deliver(3);
    expect(q.requested()).toEqual([0, 1, 0, 1]);
    expect(q.textures()).toEqual([true, true]);
    expect(isAtlasSheetLoaded(1)).toBe(true);
  });

  it("drops a band that runs between the restore event and React's reset (the epoch moves on in the event)", async () => {
    const q = mountQueue([HERE, HERE]);
    q.frame();
    await q.deliver(0, 2);
    expect(q.copies).toHaveLength(2);
    // The restore event alone, outside act: React has not rendered the reset when the next band's frame runs.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      q.canvas.dispatchEvent(event("webglcontextrestored"));
      await tick();
      await tick();
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    }
    await act(async () => {
      await flush();
    });
    expect(q.copies).toHaveLength(2);
    expect(q.textures()).toEqual([false, false]);
    expect(isAtlasSheetLoaded(0)).toBe(false);
    q.frame();
    expect(q.requested()).toEqual([0, 0]);
  });

  it("releases its sheets and stops when the map unmounts mid-upload", async () => {
    const q = mountQueue([HERE, HERE]);
    q.frame();
    const bmp = await q.deliver(0, 1);
    q.hook.unmount();
    await tick();
    expect(q.copies).toHaveLength(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
    expect(q.requested()).toEqual([0]);
    expect(isAtlasSheetLoaded(0)).toBe(false);
  });
});
