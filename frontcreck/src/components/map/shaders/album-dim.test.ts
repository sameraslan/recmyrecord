import { describe, expect, it } from 'vitest';
import { albumFragmentShader } from './album';

/** While an album is picked, the other covers dim by colour, not by alpha, so overlapping covers do not show
 * through one another. */
describe('the other covers while an album is picked', () => {
  const src = albumFragmentShader(11);

  it('move toward the map background colour (the Trifid page colour, #07060a) by u_selDim, the cover part only', () => {
    expect(src).toContain('const vec3 BACKING = vec3(0.0275, 0.0235, 0.0392);');
    expect(src).toContain('if (v_selDim > 0.5) col = mix(BACKING, col, mix(1.0, u_selDim, v_coverT));');
  });

  it('keep their alpha: u_selDim never scales it', () => {
    expect(src).not.toMatch(/alpha\s*\*=[^;]*u_selDim/);
  });

  it('cost no texture read beyond the one cover sample', () => {
    expect(src.match(/sampleAtlas\(int\(v_atlasIndex\)/g)).toHaveLength(1);
  });
});
