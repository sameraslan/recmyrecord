import { describe, expect, it } from 'vitest';
import { hexToRgb, withLightnessFloor } from './color';

const lightness = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
};

describe('withLightnessFloor', () => {
  it('lifts a colour darker than the floor to the floor, keeping its hue', () => {
    const out = withLightnessFloor('#2c3024', 0.24);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightness(out)).toBeGreaterThanOrEqual(0.235);
    expect(lightness(out)).toBeLessThanOrEqual(0.245);
    const [r, g, b] = hexToRgb(out);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });

  it('leaves a colour at or above the floor as it is', () => {
    expect(withLightnessFloor('#808080', 0.24)).toBe('#808080');
    expect(withLightnessFloor('#ede5d5', 0.24)).toBe('#ede5d5');
  });

  it('lifts black to a grey', () => {
    expect(withLightnessFloor('#000000', 0.2)).toBe('#333333');
  });
});
