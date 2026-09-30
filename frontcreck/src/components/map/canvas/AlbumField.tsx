"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { atlasSlot } from "@/lib/data/sprites";
import { CLUSTER_RGB, interpolateInto, type MapData } from "../data";
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, MAX_SPRITE_VIEWPORT_FRACTION, SELECTION_DIM } from "../shaders/album";
import { useMapStore } from "../state/mapStore";

interface AlbumFieldProps {
  data: MapData;
  atlasTextures: (THREE.Texture | null)[];
  /**
   * Flat [x0,y0,x1,y1,...] interpolated positions. Owned by AlbumField,
   * recomputed only when sliderT changes (not per frame); CursorTracker,
   * PickController, CameraTween and OverlayDriver read it.
   */
  positionsRef: React.RefObject<Float32Array>;
}

const MAX_ATLASES = 5;
/** Alpha of the dots at the overview, and on the dimmed Home, About and 404 map. */
const DOT_ALPHA = 0.78;
const DOT_ALPHA_DIMMED = 0.34;
/** Alpha factor of albums outside the focus in album view. */
const FOCUS_DIM = 0.45;
/** Slots in u_neighborMask: the seed, then the focus recommendations, padded with -1. */
const MASK_SIZE = 12;

export function AlbumField({ data, atlasTextures, positionsRef }: AlbumFieldProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Tracks the previous frame's hover uniform so we only invalidate() (under
  // frameloop="demand") on an actual change, not every frame.
  const prevHoverRef = useRef(-1);

  const { geometry, material } = useMemo(() => {
    const pointsGeom = new THREE.InstancedBufferGeometry();
    // A single 0-position vertex; the rest comes from instanced attributes
    pointsGeom.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));

    const n = data.n;
    const atlasUV = new Float32Array(n * 4);
    const atlasIdx = new Float32Array(n);
    const clusterIds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = atlasSlot(i);
      atlasUV[i * 4 + 0] = slot.u;
      atlasUV[i * 4 + 1] = slot.v;
      atlasUV[i * 4 + 2] = slot.size;
      atlasUV[i * 4 + 3] = slot.size;
      atlasIdx[i] = slot.sheet;
      clusterIds[i] = data.albums[i].k;
    }

    pointsGeom.setAttribute("a_pos_sonic", new THREE.InstancedBufferAttribute(data.pos.sonic, 2));
    pointsGeom.setAttribute("a_pos_balanced", new THREE.InstancedBufferAttribute(data.pos.balanced, 2));
    pointsGeom.setAttribute("a_pos_mood", new THREE.InstancedBufferAttribute(data.pos.mood, 2));
    pointsGeom.setAttribute("a_atlasUV", new THREE.InstancedBufferAttribute(atlasUV, 4));
    pointsGeom.setAttribute("a_atlasIndex", new THREE.InstancedBufferAttribute(atlasIdx, 1));
    pointsGeom.setAttribute("a_clusterId", new THREE.InstancedBufferAttribute(clusterIds, 1));
    pointsGeom.instanceCount = n;

    const mat = new THREE.ShaderMaterial({
      vertexShader: ALBUM_VERTEX_SHADER,
      fragmentShader: ALBUM_FRAGMENT_SHADER,
      transparent: true,
      // Depth carries the focus/hover draw-order layers (see `layer` in the
      // vertex shader). Three's default depthFunc is LessEqual, so sprites
      // in the same layer still draw in plain instance order; the fragment
      // shader discards outside the disc, so the sprite quad's corners never
      // write depth.
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      uniforms: {
        u_sliderT: { value: useMapStore.getState().sliderT },
        u_canvasHeight: { value: 800 },
        u_zoom: { value: 2.4 },
        u_pixelRatio: { value: gl.getPixelRatio() },
        u_focusedAlbumIndex: { value: -1 },
        u_neighborMask: { value: new Float32Array(MASK_SIZE).fill(-1) },
        u_hoverIndex: { value: -1 },
        u_selectedIndex: { value: -1 },
        u_selDim: { value: SELECTION_DIM },
        u_maxSpritePx: { value: 240 },
        u_dotAlpha: { value: DOT_ALPHA },
        u_focusDim: { value: FOCUS_DIM },
        u_atlas0: { value: null },
        u_atlas1: { value: null },
        u_atlas2: { value: null },
        u_atlas3: { value: null },
        u_atlas4: { value: null },
        u_atlasLoaded: { value: new Float32Array(MAX_ATLASES) },
        u_clusterColors: { value: CLUSTER_RGB.map((c) => new THREE.Vector3(...c)) },
      },
    });
    return { geometry: pointsGeom, material: mat };
  }, [data, gl]);

  // Interpolated positions used for hit-testing and overlay placement: a
  // flat typed array (allocated once per data) recomputed only when sliderT
  // changes, not per frame.
  useEffect(() => {
    if (positionsRef.current.length !== data.n * 2) {
      positionsRef.current = new Float32Array(data.n * 2);
    }
    interpolateInto(positionsRef.current, data, useMapStore.getState().sliderT);
    let last = useMapStore.getState().sliderT;
    return useMapStore.subscribe((s) => {
      if (s.sliderT === last) return;
      last = s.sliderT;
      interpolateInto(positionsRef.current, data, s.sliderT);
    });
  }, [data, positionsRef]);

  // Push texture changes into uniforms
  useEffect(() => {
    for (let i = 0; i < MAX_ATLASES; i++) {
      const tex = atlasTextures[i] ?? null;
      // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
      material.uniforms[`u_atlas${i}`].value = tex;
      material.uniforms.u_atlasLoaded.value[i] = tex ? 1 : 0;
    }
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    material.uniformsNeedUpdate = true;
    // frameloop="demand": a texture arriving is not an input event, so
    // request the frame that actually draws the new covers.
    invalidate();
  }, [atlasTextures, material, invalidate]);

  // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
  useFrame((state) => {
    const { input, sliderT, hoveredIndex } = useMapStore.getState();
    const u = material.uniforms;
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    u.u_sliderT.value = sliderT;
    // Real camera.zoom and canvas height drive the dot and cover sizes (state/zoomLimits.ts).
    u.u_zoom.value = zoom;
    // Pixel ratio and the viewport-relative sprite cap (see the gl_PointSize
    // clamp in shaders/album.ts), read live each frame so a dpr change or a
    // resize can't leave them stale; renderedSpriteCssSize, which hit testing
    // and label placement use, reads the same live values.
    const dpr = gl.getPixelRatio();
    u.u_pixelRatio.value = dpr;
    u.u_canvasHeight.value = state.size.height;
    u.u_maxSpritePx.value = state.size.height * MAX_SPRITE_VIEWPORT_FRACTION * dpr;
    u.u_dotAlpha.value = input.dimmed ? DOT_ALPHA_DIMMED : DOT_ALPHA;
    const focus = input.focus;
    u.u_focusedAlbumIndex.value = focus ? focus.seed : -1;
    // The Explore pick; never in album view, where the focus markers take over.
    u.u_selectedIndex.value = !focus && input.selected !== null ? input.selected : -1;
    const mask = u.u_neighborMask.value as Float32Array;
    mask.fill(-1);
    if (focus) {
      mask[0] = focus.seed;
      const recs = focus.recs.slice(0, MASK_SIZE - 2);
      for (let i = 0; i < recs.length; i++) mask[i + 1] = recs[i];
    }

    const hv = hoveredIndex ?? -1;
    u.u_hoverIndex.value = hv;
    if (hv !== prevHoverRef.current) {
      prevHoverRef.current = hv;
      // The ring/scale change needs its own frame under frameloop="demand".
      invalidate();
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Frustum-cull off: the geometry's only position attribute is the
  // single 0-vertex stub for instanced draw, so Three's auto-computed
  // bounding sphere has radius 0 at the origin. Any time the camera
  // recentres off-origin (focus, off-center zoom), that sphere falls
  // outside the frustum and Three skips the whole draw, every album
  // disappears, including the focused one.
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
