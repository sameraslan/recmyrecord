/**
 * Sprite size curve `cssSize = clamp(SIZE_BASE_PX * (zoom / fitZoom)^P, SIZE_MIN_PX, SIZE_MAX_PX)`.
 * At the fitted overview (ratio 1) albums are 5 px dots (mockup); the cover cross-fade runs from 24 px
 * (ratio about 2.28, AtlasManager starts loading at 2.1) to 40 px (ratio about 3, the fly-to zoom is 3.2).
 */
export const SIZE_CURVE_POWER = 1.9;
export const SIZE_BASE_PX = 5;
export const SIZE_MIN_PX = 3;
export const SIZE_MAX_PX = 90;

/** JS mirror of the vertex shader's base sprite size in CSS px (before the hover scale, dpr and caps). */
export function spriteCssSize(zoom: number, fitZoom: number): number {
  const s = SIZE_BASE_PX * Math.pow(zoom / Math.max(fitZoom, 0.0001), SIZE_CURVE_POWER);
  return Math.min(SIZE_MAX_PX, Math.max(SIZE_MIN_PX, s));
}

/** Viewport-relative sprite cap (the u_maxSpritePx uniform, set in
 * AlbumField.tsx): a single album cover should never dominate more than 18%
 * of the viewport height, even at max zoom on a short window. */
export const MAX_SPRITE_VIEWPORT_FRACTION = 0.18;

/**
 * JS mirror of the sprite diameter the vertex shader actually draws, in CSS
 * px: the size curve times the per-instance `scale` (0.85 dimmed, 1.25
 * hovered), then the 240 device-px and u_maxSpritePx caps. Hit testing and
 * tooltip placement use it so both track the disc on screen at every zoom.
 */
export function renderedSpriteCssSize(
  zoom: number,
  fitZoom: number,
  viewportHeightCssPx: number,
  pixelRatio: number,
  scale = 1,
): number {
  const capDevicePx = Math.min(240, viewportHeightCssPx * MAX_SPRITE_VIEWPORT_FRACTION * pixelRatio);
  return Math.min(spriteCssSize(zoom, fitZoom) * scale * pixelRatio, capDevicePx) / pixelRatio;
}

export const ALBUM_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_pos_sonic;
  attribute vec2 a_pos_balanced;
  attribute vec2 a_pos_mood;
  attribute vec4 a_atlasUV;       // (u, v, w, h)
  attribute float a_atlasIndex;   // float so vertex attribs work
  attribute float a_clusterId;

  uniform float u_sliderT;
  uniform float u_zoomT;
  uniform float u_zoom;   // real camera.zoom (dynamic min..5), not normalized
  uniform float u_fitZoom; // zoom at which the whole album cloud fits the frustum
  uniform float u_pixelRatio;
  uniform float u_focusedAlbumIndex;
  uniform float u_neighborMask[12];  // focus album indices (seed first), padded with -1
  uniform float u_hoverIndex;   // -1 = no hover target
  uniform float u_maxSpritePx;  // device px cap, viewportHeightCssPx * 0.18 * dpr

  varying vec2 v_atlasOrigin;
  varying vec2 v_atlasSize;
  varying float v_atlasIndex;
  varying float v_clusterId;
  varying float v_dim;          // 0 = full opacity, 1 = dimmed in focus mode
  varying float v_screenSize;   // pixels
  varying float v_hovered;      // 1 = this instance is the hover target
  varying float v_anchor;       // 1 = focus album, drawn as a small anchor dot under its DOM cover

  vec2 interpolatePos() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_pos_sonic, a_pos_balanced, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_pos_balanced, a_pos_mood, t);
  }

  bool isHighlighted(float instanceIndex) {
    for (int i = 0; i < 12; i++) {
      if (abs(u_neighborMask[i] - instanceIndex) < 0.5) return true;
    }
    return false;
  }

  void main() {
    float instanceIndex = float(gl_InstanceID);
    vec2 worldPos = interpolatePos();

    // Power curve of the real camera zoom relative to u_fitZoom (the fitted overview zoom, state/view.ts):
    // 5 px dots at the overview, covers as the visitor zooms in. Mirrors spriteCssSize above.
    float baseSize = clamp(${SIZE_BASE_PX.toFixed(1)} * pow(u_zoom / max(u_fitZoom, 0.0001), ${SIZE_CURVE_POWER.toFixed(2)}), ${SIZE_MIN_PX.toFixed(1)}, ${SIZE_MAX_PX.toFixed(1)});  // px

    // Draw-order layers via depth (the material writes depth, LessEqual
    // test). All albums share one instanced draw, so without this a later
    // instance paints over an earlier one; in focus mode a highlighted
    // neighbour could cover the focused album entirely, showing the
    // wrong cover under the focused album's label.
    // Layers, toward the camera: focused 0.3 > hovered 0.2 > highlighted
    // neighbour 0.1 > everything else 0.0. Same-layer sprites keep plain
    // painter's order, so the overview (all 0.0) is unchanged.
    float layer = 0.0;
    if (u_focusedAlbumIndex >= 0.0 && isHighlighted(instanceIndex)) layer = 0.1;
    if (abs(u_hoverIndex - instanceIndex) < 0.5) layer = 0.2;
    if (abs(u_focusedAlbumIndex - instanceIndex) < 0.5) layer = 0.3;

    vec4 mvPos = modelViewMatrix * vec4(worldPos, layer, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float scale = 1.0;
    v_dim = 0.0;
    v_anchor = 0.0;
    if (u_focusedAlbumIndex >= 0.0) {
      if (isHighlighted(instanceIndex)) {
        v_anchor = 1.0;   // focus albums are drawn as DOM covers; the point is a small anchor dot
      } else {
        v_dim = 1.0;
        scale = 0.85;
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5) ? 1.0 : 0.0;
    if (v_hovered > 0.5) scale = 1.25;
    // Clamp at 240 device-px (most desktop GPUs cap GL_POINTS sprites around 256, so without this a
    // high-DPR viewport at max zoom asks for a sprite large enough that the driver silently culls the
    // whole point) and at u_maxSpritePx (a viewport-relative cap so a single cover never dominates).
    gl_PointSize = v_anchor > 0.5
      ? 5.0 * u_pixelRatio
      : min(baseSize * scale * u_pixelRatio, min(240.0, u_maxSpritePx));
    v_screenSize = gl_PointSize;

    v_atlasOrigin = a_atlasUV.xy;
    v_atlasSize = a_atlasUV.zw;
    v_atlasIndex = a_atlasIndex;
    v_clusterId = a_clusterId;
  }
`;

export const ALBUM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_atlas0;
  uniform sampler2D u_atlas1;
  uniform sampler2D u_atlas2;
  uniform sampler2D u_atlas3;
  uniform sampler2D u_atlas4;
  uniform float u_atlasLoaded[5];  // 0/1 flags
  uniform vec3 u_clusterColors[8];
  uniform float u_pixelRatio;
  uniform float u_dotAlpha;   // 0.78, 0.34 when the map is dimmed
  uniform float u_focusDim;   // alpha factor of albums outside the focus

  const vec3 PAPER = vec3(0.929, 0.898, 0.835); // #ede5d5

  varying vec2 v_atlasOrigin;
  varying vec2 v_atlasSize;
  varying float v_atlasIndex;
  varying float v_clusterId;
  varying float v_dim;
  varying float v_screenSize;
  varying float v_hovered;
  varying float v_anchor;

  // Returns vec4(rgb, loaded) where loaded = 1.0 if the atlas was sampled,
  // 0.0 if the atlas isn't loaded yet (caller falls back to the dot color).
  vec4 sampleAtlas(int idx, vec2 uv) {
    if (idx == 0 && u_atlasLoaded[0] > 0.5) return vec4(texture2D(u_atlas0, uv).rgb, 1.0);
    if (idx == 1 && u_atlasLoaded[1] > 0.5) return vec4(texture2D(u_atlas1, uv).rgb, 1.0);
    if (idx == 2 && u_atlasLoaded[2] > 0.5) return vec4(texture2D(u_atlas2, uv).rgb, 1.0);
    if (idx == 3 && u_atlasLoaded[3] > 0.5) return vec4(texture2D(u_atlas3, uv).rgb, 1.0);
    if (idx == 4 && u_atlasLoaded[4] > 0.5) return vec4(texture2D(u_atlas4, uv).rgb, 1.0);
    return vec4(0.0);
  }

  float atlasLoaded(int idx) {
    if (idx == 0) return u_atlasLoaded[0];
    if (idx == 1) return u_atlasLoaded[1];
    if (idx == 2) return u_atlasLoaded[2];
    if (idx == 3) return u_atlasLoaded[3];
    if (idx == 4) return u_atlasLoaded[4];
    return 0.0;
  }

  vec3 clusterColor(int id) {
    if (id == 0) return u_clusterColors[0];
    if (id == 1) return u_clusterColors[1];
    if (id == 2) return u_clusterColors[2];
    if (id == 3) return u_clusterColors[3];
    if (id == 4) return u_clusterColors[4];
    if (id == 5) return u_clusterColors[5];
    if (id == 6) return u_clusterColors[6];
    return u_clusterColors[7];
  }

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    // Cover mode kicks in once a sprite is large enough on screen to read.
    // Compare in CSS pixels by dividing out the pixel ratio baked into
    // v_screenSize (gl_PointSize is in device pixels).
    float cssSize = v_screenSize / max(u_pixelRatio, 0.0001);
    // Covers cross-fade in between 24 and 40 CSS px, so the switch reads as a fade, not a pop. Until
    // the album's atlas sheet has loaded the sprite stays a translucent dot.
    float coverT = smoothstep(24.0, 40.0, cssSize) * step(0.5, atlasLoaded(int(v_atlasIndex)));
    // Shape: a round dot that becomes a square cover with 2 CSS px corners over the cross-fade
    // (rounded-box distance with the corner radius shrinking from the full 0.5 to 2 px). r is that
    // distance shifted so the sprite edge is at r = 0.5, like the radius of a disc.
    float corner = mix(0.5, min(0.5, 2.0 * u_pixelRatio / max(v_screenSize, 1.0)), coverT);
    vec2 q = abs(coord) - vec2(0.5 - corner);
    float r = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) + 0.5 - corner;
    float aa = fwidth(r);

    // Colours are authored in sRGB; ShaderMaterial does not auto-apply the linear->sRGB output
    // conversion, so the literal values go straight to the framebuffer.

    // Ring geometry, in r-space: one device pixel is 1/v_screenSize, since r=0.5 spans half the
    // sprite's on-screen size. On a hovered sprite (1.25x bigger, see the vertex shader) the disc or
    // cover ends 3 px short of the sprite edge and a paper ring fills the band out to r=0.5.
    float pxR = 1.0 / max(v_screenSize, 1.0);
    float discEdge = v_hovered > 0.5 ? 0.5 - 3.0 * pxR : 0.5;

    float discMask = 1.0 - smoothstep(0.5 - aa, 0.5, r);
    if (discMask <= 0.0) discard;
    vec3 col = clusterColor(int(v_clusterId));
    if (coverT > 0.0) {
      // Cover mode: sample the atlas cell of this album
      vec2 uvInAtlas = v_atlasOrigin + gl_PointCoord * v_atlasSize;
      col = mix(col, sampleAtlas(int(v_atlasIndex), uvInAtlas).rgb, coverT);
    }

    float alpha = discMask * mix(u_dotAlpha, 1.0, coverT);
    if (v_dim > 0.5) alpha *= u_focusDim;
    if (v_anchor > 0.5) {
      col = PAPER;
      alpha = discMask * 0.8;
    }
    if (v_hovered > 0.5) {
      // 1.5 px paper ring outside the disc, the band between discEdge and the sprite edge
      float ring = smoothstep(discEdge - aa, discEdge, r);
      col = mix(col, PAPER, ring);
      alpha = max(alpha, ring * discMask);
    }
    gl_FragColor = vec4(col, alpha);
  }
`;
