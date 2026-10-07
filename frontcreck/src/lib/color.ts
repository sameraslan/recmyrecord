/** '#rrggbb' to [r, g, b] in 0..255: the one hex parser (map dot colours, ambient washes, contrast checks). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * `hex` with its HSL lightness raised to `floor` (0..1) when it is darker; hue and saturation stay. A colour at
 * or above the floor is returned as it is.
 */
export function withLightnessFloor(hex: string, floor: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= floor) return hex;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const c = (1 - Math.abs(2 * floor - 1)) * s;
  const x = c * (1 - Math.abs((((h % 6) + 6) % 2) - 1));
  const m = floor - c / 2;
  const k = Math.floor((((h % 6) + 6) % 6));
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return `#${rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
