"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { COPY } from "@/lib/copy";
import { useIsNarrow } from "@/lib/media";
import type { MapCamera } from "@/lib/types";
import { interpolated } from "../data";
import { setInvalidate } from "../state/invalidate";
import { useMapStore } from "../state/mapStore";
import type { MapApi } from "../types";
import { AlbumField } from "./AlbumField";
import { useAtlasTextures } from "./AtlasManager";
import { CameraBounds } from "./CameraBounds";
import { CameraRig } from "./CameraRig";
import { CameraTween } from "./CameraTween";
import { CursorTracker } from "./CursorTracker";
import { FrameCounter } from "./FrameCounter";
import { FocusFramer } from "./FocusFramer";
import { GasField } from "./GasField";
import { FRUSTUM_HALF_HEIGHT, InitialFrame } from "./InitialFrame";
import { MarkerDriver } from "./MarkerDriver";
import { MorphDriver } from "./MorphDriver";
import { OverlayDriver } from "./OverlayDriver";
import { PickController } from "./PickController";
import { RegionNamesDriver } from "./RegionNamesDriver";
import { TwinkleDriver } from "./TwinkleDriver";

// Bridges R3F's demand-mode invalidate() out to state/invalidate.ts, so DOM
// overlays and stores outside the <Canvas> can request a render without
// importing @react-three/fiber.
function InvalidateBridge() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setInvalidate(invalidate);
    return () => setInvalidate(null);
  }, [invalidate]);
  return null;
}

/** Keeps the canvas in the tab order, and its label promising drag and keys, only while the map takes input. */
function CanvasFocusability() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const sync = (interactive: boolean) => {
      // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
      gl.domElement.tabIndex = interactive ? 0 : -1;
      gl.domElement.setAttribute("aria-label", interactive ? COPY.map.canvasLabel : COPY.map.canvasLabelStatic);
    };
    sync(useMapStore.getState().input.interactive);
    return useMapStore.subscribe((s, prev) => {
      if (s.input.interactive !== prev.input.interactive) sync(s.input.interactive);
    });
  }, [gl]);
  return null;
}

/** How long a lost WebGL context may take to come back before the map gives way to the no-WebGL message. */
const CONTEXT_RESTORE_MS = 3000;

/** A lost context redraws once restored; one that stays lost reports itself (MapCallbacks.onContextLost). */
function ContextLossGuard() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onLost = (e: Event) => {
      e.preventDefault(); // allows the browser to restore the context
      if (timer === null) timer = setTimeout(() => useMapStore.getState().callbacks.onContextLost(), CONTEXT_RESTORE_MS);
    };
    const onRestored = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      if (timer !== null) clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, invalidate]);
  return null;
}

export function Scene({ initialCamera, onApi }: { initialCamera: MapCamera | null; onApi: (api: MapApi | null) => void }) {
  const data = useMapStore((s) => s.data);
  const narrow = useIsNarrow();
  if (!data) return null;
  return (
    <Canvas
      orthographic
      frameloop="demand"
      camera={{
        manual: true,
        zoom: 2.4,
        position: [0, 0, 5],
        near: 0.1,
        far: 100,
        // Placeholder frustum: InitialFrame applies the real one on mount and
        // on every resize, in a layout effect before the first frame is drawn.
        left: -FRUSTUM_HALF_HEIGHT,
        right: FRUSTUM_HALF_HEIGHT,
        top: FRUSTUM_HALF_HEIGHT,
        bottom: -FRUSTUM_HALF_HEIGHT,
      }}
      // Transparent, so the pane's background and the album's ambient wash show through; three's normal
      // blending writes premultiplied colour, which matches the browser's default compositing.
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      // Narrow (touch) layouts cap dpr at 1.5: phones already push more pixels per point, and pinch and pan
      // draw every frame, so fill-rate matters more there.
      dpr={[1, narrow ? 1.5 : 2]}
      // R3F puts an inline `pointer-events: auto` on its wrapper otherwise, which would override
      // `.map-host { pointer-events: none }` on Home, About and 404.
      style={{ position: "absolute", inset: 0, pointerEvents: "inherit" }}
      onCreated={({ gl }) => {
        // Our ShaderMaterials write sRGB-authored colors straight to the
        // framebuffer (Three.js does not auto-inject the linear->sRGB
        // conversion for custom ShaderMaterials). LinearSRGBColorSpace
        // tells Three.js not to apply any conversion either, so the
        // literal hex values land in the framebuffer unchanged.
        gl.outputColorSpace = THREE.LinearSRGBColorSpace;
        gl.setClearColor(0x000000, 0);
        const canvas = gl.domElement;
        canvas.classList.add("map-canvas");
        canvas.setAttribute("role", "img");
        const interactive = useMapStore.getState().input.interactive;
        canvas.setAttribute("aria-label", interactive ? COPY.map.canvasLabel : COPY.map.canvasLabelStatic);
        canvas.tabIndex = interactive ? 0 : -1;
      }}
    >
      <SceneInner initialCamera={initialCamera} onApi={onApi} />
    </Canvas>
  );
}

function SceneInner({ initialCamera, onApi }: { initialCamera: MapCamera | null; onApi: (api: MapApi | null) => void }) {
  const data = useMapStore((s) => s.data)!;
  const theme = useMapStore((s) => s.theme);
  // Hot-path pointer state lives in refs, not React state: pointermove and
  // zoom frames must never trigger a SceneInner re-render.
  // Canvas-relative CSS px of the mouse, written by CursorTracker.
  const cursorRef = useRef<[number, number] | null>(null);
  // Hover target index (-1 = none) before the 80 ms settle, written by
  // CursorTracker, read by PickController so a click picks what hover shows.
  const hoverRef = useRef(-1);
  // Flat [x0,y0,x1,y1,...] interpolated positions, owned and recomputed by
  // AlbumField whenever sliderT changes.
  const [initialPositions] = useState(() => interpolated(data, useMapStore.getState().sliderT));
  const positionsRef = useRef<Float32Array>(initialPositions);
  const textures = useAtlasTextures(data, positionsRef);

  return (
    <>
      <InvalidateBridge />
      <CanvasFocusability />
      <ContextLossGuard />
      {/* Snaps the camera to the fitted overview once per data load and
          publishes the framing (state/view.ts) that CameraRig, AlbumField,
          AtlasManager, CameraBounds and CameraTween read. */}
      <InitialFrame />
      <CameraRig />
      <CameraTween positionsRef={positionsRef} initialCamera={initialCamera} onApi={onApi} />
      <FocusFramer />
      <CursorTracker cursorRef={cursorRef} hoverRef={hoverRef} positionsRef={positionsRef} />
      <PickController positionsRef={positionsRef} hoverRef={hoverRef} />
      {/* Before AlbumField: its frame callback moves sliderT, which AlbumField draws in the same frame. */}
      <MorphDriver />
      {/* The gas reads the slider position MorphDriver has just written and is drawn under the album points.
          Without a theme there is no gas: the pane's sky colour shows through the transparent canvas. */}
      {theme ? <GasField data={data} theme={theme} /> : null}
      <AlbumField data={data} atlasTextures={textures} positionsRef={positionsRef} />
      <OverlayDriver positionsRef={positionsRef} />
      <MarkerDriver positionsRef={positionsRef} />
      {/* Region names: placed on every drawn frame, hidden while an album is open or the map is zoomed in. */}
      <RegionNamesDriver positionsRef={positionsRef} />
      {/* After MarkerDriver: a glint keeps clear of the covers it placed. It never asks for a frame. */}
      <TwinkleDriver positionsRef={positionsRef} />
      <FrameCounter />
      {/* Mounted last so its frame callback runs after every other camera
          writer, reining the idle camera back into the album cloud. */}
      <CameraBounds />
    </>
  );
}
