import { describe, expect, it } from "vitest";

import { MAX_ATLAS_SHEETS, atlasCount } from "@/lib/data/sprites";
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, albumFragmentShader, albumVertexShader, shaderSheetCount } from "./album";

const samplers = (src: string) => [...src.matchAll(/uniform sampler2D (u_atlas\d+);/g)].map((m) => m[1]);
const sampled = (src: string) => [...src.matchAll(/texture2D\((u_atlas\d+), uv\)/g)].map((m) => m[1]);

describe("the album shader is written for the number of atlas sheets the data has", () => {
  it("declares and samples one texture per sheet", () => {
    for (const n of [1, 4, 5, 11, 16]) {
      const names = Array.from({ length: n }, (_, i) => `u_atlas${i}`);
      const frag = albumFragmentShader(n);
      expect(samplers(frag)).toEqual(names);
      expect(sampled(frag)).toEqual(names);
      expect(albumVertexShader(n)).toContain(`uniform float u_atlasLoaded[${n}];`);
    }
  });

  it("draws every sheet of the 10,467-album catalog, the last one included", () => {
    const n = shaderSheetCount(atlasCount(10467));
    expect(n).toBe(11);
    expect(albumFragmentShader(n)).toContain("return texture2D(u_atlas10, uv).rgb;");
    expect(albumFragmentShader(n)).toContain("if (idx == 9) return texture2D(u_atlas9, uv).rgb;");
  });

  it("keeps an album on a sheet the shader does not have as a dot", () => {
    // Out of range reads as not loaded, so coverT stays 0 and the fragment shader never samples for it.
    expect(albumVertexShader(11)).toMatch(/float atlasLoaded\(int idx\) \{\s*if \(idx < 0 \|\| idx >= 11\) return 0\.0;\s*return u_atlasLoaded\[idx\];/);
  });

  it("never asks for more textures than a WebGL2 fragment shader is sure to have", () => {
    expect(shaderSheetCount(4)).toBe(4);
    expect(shaderSheetCount(0)).toBe(1);
    expect(shaderSheetCount(40)).toBe(MAX_ATLAS_SHEETS);
    expect(shaderSheetCount(11, 8)).toBe(8);
    expect(samplers(albumFragmentShader(40))).toHaveLength(MAX_ATLAS_SHEETS);
  });

  it("still exports a default pair of sources", () => {
    expect(samplers(ALBUM_FRAGMENT_SHADER)).toHaveLength(5);
    expect(ALBUM_VERTEX_SHADER).toContain("uniform float u_atlasLoaded[5];");
  });
});
