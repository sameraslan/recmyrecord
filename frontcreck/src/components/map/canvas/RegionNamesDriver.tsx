'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { useMapStore } from '../state/mapStore';
import { clearNamesPlacer, setNamesPlacer } from '../state/nameWidths';
import { buildNamesWorld, createNamesPlacer, watchNamesRest } from '../state/namesPlacer';

/** Places the region names (state/namesPlacer.ts) on every rendered frame, when RegionNames asks
 * (state/nameWidths.ts placeNamesNow), and once when a motion has ended without a frame that placed them at
 * rest (watchNamesRest: a DOM write, no frame). It never asks for a frame and reads no layout, so nothing
 * happens at rest. */
export function RegionNamesDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const theme = useMapStore((s) => s.theme);
  const data = useMapStore((s) => s.data);
  // Label points in world units, once per theme.
  const world = useMemo(() => (theme && data ? buildNamesWorld(theme, data.tx) : null), [theme, data]);
  const [placer] = useState(createNamesPlacer);

  useEffect(() => {
    const place = () => {
      const { width, height } = get().size;
      return placer(world, camera, width, height, positionsRef.current);
    };
    // For RegionNames to call when only the names changed (no map frame is drawn for it). Registered again
    // whenever the labels change, so what it calls never holds an older theme's labels.
    setNamesPlacer(place);
    // The labels arrived or changed (the theme can load after the map): place them now. RegionNames, which
    // renders in another React root, may have asked just before this ran and been told there were none.
    place();
    const unwatch = watchNamesRest(placer.pending, place);
    return () => {
      unwatch();
      clearNamesPlacer(place);
    };
  }, [placer, world, camera, get, positionsRef]);

  useFrame((state) => {
    placer(world, camera, state.size.width, state.size.height, positionsRef.current);
  });

  return null;
}
