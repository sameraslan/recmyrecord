import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** AlbumField needs WebGL to run, so these checks read its source, as shaders/album.test.ts reads the shader. */
const src = fs.readFileSync(path.join(process.cwd(), 'src/components/map/canvas/AlbumField.tsx'), 'utf8');

describe('AlbumField and the random stars', () => {
  it("takes the star classes from the page load's one deal, in one place", () => {
    expect(src.match(/pageStarClasses\(/g)).toHaveLength(1);
    expect(src).toMatch(/const classes = pageStarClasses\(n\);/);
  });

  it('sets the star size attribute once and never rewrites it: only the tint and the gas luminance follow the theme', () => {
    expect(src.match(/"a_star"/g)).toHaveLength(1);
    expect(src).not.toMatch(/getAttribute\("a_star"\)/);
    expect(src).toMatch(/getAttribute\("a_tint"\)/);
    expect(src).toMatch(/getAttribute\("a_bg"\)/);
  });

  it('reads nothing of the album record, its index or a rank to draw a star', () => {
    expect(src).not.toMatch(/data\.albums/);
    expect(src).not.toMatch(/a_clusterId|CLUSTER_RGB|starClass\(|\brank\b/);
  });

  it('keeps the depth settings that order overlapping covers', () => {
    expect(src).toMatch(/depthWrite: true,\s*depthTest: true,\s*depthFunc: THREE\.LessEqualDepth,/);
  });
});
