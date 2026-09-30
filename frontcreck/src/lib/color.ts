/** '#rrggbb' to [r, g, b] in 0..255: the one hex parser (map dot colours, ambient washes, contrast checks). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
