"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { MAP_REVEAL_BUDGET_MS, getMapReveal, setMapReveal, subscribeMapReveal } from "../state/reveal";

/** The class that keeps the canvas see-through over the stand-in nebula (styles/map.css). Scene.tsx puts it on a
 * new canvas while the map has shown nothing yet. */
export const VEILED = "is-veiled";

/**
 * Shows the canvas for the first time (state/reveal.ts). The canvas starts see-through, over the stand-in nebula
 * of the first paint, and its first frame holds the stars alone. So it is not presented yet: it fades in when the
 * gas layer has drawn the nebula (GasField says 'gas'), which with the image asked for early is a frame or two
 * later, and stars and nebula arrive as one picture that is never darker than the stand-in. If the nebula has not
 * come MAP_REVEAL_BUDGET_MS after the first frame, the stars fade in over the stand-in ('stars') and the nebula
 * follows when it can. With no nebula to wait for ('sky') it shows at once.
 * Mounted after GasField, so in a frame its callback runs after the one that says 'gas'.
 */
export function Reveal() {
  const gl = useThree((s) => s.gl);
  const budget = useRef(0);
  const drawn = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;
    const show = () => {
      if (getMapReveal() === "wait" || !canvas.classList.contains(VEILED)) return;
      // The fade runs from the style the browser last worked out. A canvas made and shown between two of the
      // browser's frames was never styled as see-through, and would jump in; so the style is worked out now.
      void getComputedStyle(canvas).opacity;
      canvas.classList.remove(VEILED);
    };
    show();
    const off = subscribeMapReveal(show);
    return () => {
      off();
      window.clearTimeout(budget.current);
    };
  }, [gl]);

  useFrame(() => {
    if (drawn.current) return;
    drawn.current = true;
    if (getMapReveal() === "wait") budget.current = window.setTimeout(() => setMapReveal("stars"), MAP_REVEAL_BUDGET_MS);
  });

  return null;
}
