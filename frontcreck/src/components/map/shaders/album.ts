import {
  COVER_FADE_END_PX,
  COVER_FADE_START_PX,
  COVER_MAX_PX,
  COVER_WORLD,
  DOT_BASE_PX,
  DOT_MAX_PX,
  DOT_MIN_PX,
  DOT_SCALE_PX,
  FRUSTUM_HALF_HEIGHT,
  coverCssPx,
  coverFade,
  dotCssPx,
} from "../state/zoomLimits";

/**
 * Sprite sizes (see state/zoomLimits.ts): a dot of 3 to 7 CSS px that grows gently with the map scale, cross-fading to a cover whose size is linear in the map scale (COVER_WORLD world
 * units, 16 to 32 CSS px during the fade, at most 64). An album whose atlas sheet has not loaded yet
 * stays a dot.
 */

/** JS mirror of the vertex shader's base sprite size in CSS px (before hover, focus scale, dpr and caps). */
export function spriteCssSize(zoom: number, canvasHeightCssPx: number, loaded = true): number {
  const dot = dotCssPx(zoom, canvasHeightCssPx);
  if (!loaded) return dot;
  const t = coverFade(zoom, canvasHeightCssPx);
  return dot + (coverCssPx(zoom, canvasHeightCssPx) - dot) * t;
}

/** Viewport-relative sprite cap (the u_maxSpritePx uniform, set in
 * AlbumField.tsx): a single album cover should never dominate more than 18%
 * of the viewport height, even at max zoom on a short window. */
export const MAX_SPRITE_VIEWPORT_FRACTION = 0.18;

/**
 * JS mirror of the sprite size the vertex shader actually draws, in CSS px:
 * the base size times `scale`, then the
 * 240 device-px and u_maxSpritePx caps. Hit testing and overlay placement use
 * it so both track the sprite on screen at every zoom.
 */
export function renderedSpriteCssSize(
  zoom: number,
  canvasHeightCssPx: number,
  pixelRatio: number,
  scale = 1,
  loaded = true,
): number {
  const capDevicePx = Math.min(240, canvasHeightCssPx * MAX_SPRITE_VIEWPORT_FRACTION * pixelRatio);
  return Math.min(spriteCssSize(zoom, canvasHeightCssPx, loaded) * scale * pixelRatio, capDevicePx) / pixelRatio;
}

/** The album picked in Explore, once covers show (coverT > 0.5), is drawn this much larger than the other
 * covers and at least SELECTED_MIN_PX, on top, with a SELECTED_FRAME_PX lamp frame SELECTED_FRAME_GAP_PX
 * outside it (mockup: max(cs * 1.8, 64), strokeRect 4 px out, line width 2). */
export const SELECTED_SCALE = 1.8;
export const SELECTED_MIN_PX = 64;
export const SELECTED_FRAME_GAP_PX = 4;
export const SELECTED_FRAME_PX = 2;
/** CSS px the selected sprite adds around the cover for its frame (both sides, plus a pixel for antialiasing). */
const SELECTED_QUAD_EXTRA = 2 * (SELECTED_FRAME_GAP_PX + SELECTED_FRAME_PX / 2) + 2;
/** Alpha factor of the other covers while an album is picked (mockup coverA * .5); dots are unaffected. */
export const SELECTION_DIM = 0.5;

/** True when the picked album is drawn large and framed by the shader (else OverlayDriver's DOM ring marks it). */
export function selectedIsProminent(zoom: number, canvasHeightCssPx: number, loaded: boolean): boolean {
  return loaded && coverFade(zoom, canvasHeightCssPx) > 0.5;
}

/** JS mirror of the shader: CSS px of the picked album's cover while it is prominent (hit testing uses it). */
export function selectedSpriteCssSize(zoom: number, canvasHeightCssPx: number, pixelRatio: number): number {
  const s = Math.max(spriteCssSize(zoom, canvasHeightCssPx, true) * SELECTED_SCALE, SELECTED_MIN_PX);
  const capCss = Math.min(240, canvasHeightCssPx * MAX_SPRITE_VIEWPORT_FRACTION * pixelRatio) / pixelRatio;
  return s + SELECTED_QUAD_EXTRA > capCss ? capCss - SELECTED_QUAD_EXTRA : s;
}

const f = (v: number) => v.toFixed(4);

export const ALBUM_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_pos_sonic;
  attribute vec2 a_pos_balanced;
  attribute vec2 a_pos_mood;
  attribute vec4 a_atlasUV;       // (u, v, w, h)
  attribute float a_atlasIndex;   // float so vertex attribs work
  attribute float a_clusterId;

  uniform float u_sliderT;
  uniform float u_zoom;          // real camera.zoom
  uniform float u_canvasHeight;  // CSS px
  uniform float u_pixelRatio;
  uniform float u_focusedAlbumIndex;
  uniform float u_neighborMask[12];  // focus album indices (seed first), padded with -1
  uniform float u_hoverIndex;   // -1 = no hover target
  uniform float u_selectedIndex; // album picked in Explore, -1 = none (always -1 in album view)
  uniform float u_maxSpritePx;  // device px cap, viewportHeightCssPx * 0.18 * dpr
  uniform float u_atlasLoaded[5];

  varying vec2 v_atlasOrigin;
  varying vec2 v_atlasSize;
  varying float v_atlasIndex;
  varying float v_clusterId;
  varying float v_dim;          // 1 = outside the focus in album view
  varying float v_hovered;      // 1 = this instance is the hover target
  varying float v_anchor;       // 1 = focus album, drawn as a small anchor dot under its DOM cover
  varying float v_coverT;       // 0 = dot, 1 = cover fully shown
  varying float v_baseCss;      // CSS px of the dot or cover itself
  varying float v_quadCss;      // CSS px of the point sprite (larger when hovered, for the ring)
  varying float v_dotCss;       // CSS px of the dot at this zoom (hover core dot)
  varying float v_markGap;      // CSS px between the drawn album and the hover mark
  varying float v_sel;          // 1 = the picked album, drawn large and framed (cover mode)
  varying float v_selDim;       // 1 = another album while one is picked

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

  float atlasLoaded(int idx) {
    if (idx == 0) return u_atlasLoaded[0];
    if (idx == 1) return u_atlasLoaded[1];
    if (idx == 2) return u_atlasLoaded[2];
    if (idx == 3) return u_atlasLoaded[3];
    if (idx == 4) return u_atlasLoaded[4];
    return 0.0;
  }

  void main() {
    float instanceIndex = float(gl_InstanceID);
    vec2 worldPos = interpolatePos();

    // Sizes mirror spriteCssSize (shaders/album.ts) and state/zoomLimits.ts.
    float pxPerWorld = u_canvasHeight * u_zoom / ${f(2 * FRUSTUM_HALF_HEIGHT)};
    float dotCss = clamp(${f(DOT_BASE_PX)} + pxPerWorld * ${f(COVER_WORLD / DOT_SCALE_PX)}, ${f(DOT_MIN_PX)}, ${f(DOT_MAX_PX)});
    float coverCss = min(${f(COVER_MAX_PX)}, ${f(COVER_WORLD)} * pxPerWorld);
    float coverT = smoothstep(${f(COVER_FADE_START_PX)}, ${f(COVER_FADE_END_PX)}, coverCss)
      * step(0.5, atlasLoaded(int(a_atlasIndex)));
    float baseCss = mix(dotCss, coverCss, coverT);

    // Draw-order layers via depth (the material writes depth, LessEqual
    // test). All albums share one instanced draw, so without this a later
    // instance paints over an earlier one. Layers, toward the camera:
    // focused 0.3 > hovered 0.2 > highlighted neighbour 0.1 > everything
    // else 0.0. Same-layer sprites keep plain painter's order.
    // The picked album in cover mode (Explore) is above everything: 0.4.
    float layer = 0.0;
    if (u_focusedAlbumIndex >= 0.0 && isHighlighted(instanceIndex)) layer = 0.1;
    if (abs(u_hoverIndex - instanceIndex) < 0.5) layer = 0.2;
    if (abs(u_focusedAlbumIndex - instanceIndex) < 0.5) layer = 0.3;
    float isSelected = (u_selectedIndex >= 0.0 && abs(u_selectedIndex - instanceIndex) < 0.5) ? 1.0 : 0.0;
    v_sel = (isSelected > 0.5 && coverT > 0.5) ? 1.0 : 0.0;
    v_selDim = (u_selectedIndex >= 0.0 && isSelected < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) layer = 0.4;

    vec4 mvPos = modelViewMatrix * vec4(worldPos, layer, 1.0);
    gl_Position = projectionMatrix * mvPos;

    v_dim = 0.0;
    v_anchor = 0.0;
    if (u_focusedAlbumIndex >= 0.0) {
      if (isHighlighted(instanceIndex)) {
        v_anchor = 1.0;   // focus albums are drawn as DOM covers; the point is a small anchor dot
        baseCss = 5.0;
        coverT = 0.0;
      } else {
        v_dim = 1.0;   // same size as in the overview (mockup), only fainter
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5 && v_sel < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) baseCss = max(baseCss * ${f(SELECTED_SCALE)}, ${f(SELECTED_MIN_PX)});
    // Hover mark (mockup): a ring of radius 7 around a dot, a square stroke 3 px outside a cover, and in
    // between a stroke that follows the drawn shape at a gap that shrinks to 3 px. The sprite grows to hold it.
    float markGap = mix(max(7.0 - 0.5 * baseCss, 3.0), 3.0, coverT);
    float quadCss = v_hovered > 0.5 ? max(baseCss + 2.0 * markGap + 2.0, 17.0) : baseCss;
    if (v_sel > 0.5) quadCss = baseCss + ${f(SELECTED_QUAD_EXTRA)};
    // Clamp at 240 device-px (most GPUs cap GL_POINTS sprites around 256) and at u_maxSpritePx (a
    // viewport-relative cap so a single cover never dominates a short window).
    float capCss = min(240.0, u_maxSpritePx) / u_pixelRatio;
    if (v_sel > 0.5 && quadCss > capCss) {
      // The frame keeps its size; the cover gives way (selectedSpriteCssSize mirrors this).
      baseCss = capCss - ${f(SELECTED_QUAD_EXTRA)};
      quadCss = capCss;
    } else if (quadCss > capCss) {
      baseCss *= capCss / quadCss;
      quadCss = capCss;
    }
    gl_PointSize = quadCss * u_pixelRatio;

    v_coverT = coverT;
    v_baseCss = baseCss;
    v_quadCss = quadCss;
    v_dotCss = dotCss;
    v_markGap = markGap;
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
  uniform vec3 u_clusterColors[8];
  uniform float u_pixelRatio;
  uniform float u_dotAlpha;   // 0.78, 0.34 when the map is dimmed
  uniform float u_focusDim;   // alpha factor of albums outside the focus
  uniform float u_selDim;     // alpha factor of the other covers while an album is picked

  const vec3 PAPER = vec3(0.929, 0.898, 0.835); // #ede5d5
  const vec3 LAMP = vec3(0.902, 0.659, 0.337);  // #e6a856
  const vec3 ROOM = vec3(0.082, 0.067, 0.051);  // #15110d

  varying vec2 v_atlasOrigin;
  varying vec2 v_atlasSize;
  varying float v_atlasIndex;
  varying float v_clusterId;
  varying float v_dim;
  varying float v_hovered;
  varying float v_anchor;
  varying float v_coverT;
  varying float v_baseCss;
  varying float v_quadCss;
  varying float v_dotCss;
  varying float v_markGap;
  varying float v_sel;
  varying float v_selDim;

  /** Signed distance to a sharp-cornered square of half size h. */
  float squareSd(vec2 p, float h) {
    vec2 q = abs(p) - vec2(h);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }

  vec3 sampleAtlas(int idx, vec2 uv) {
    if (idx == 0) return texture2D(u_atlas0, uv).rgb;
    if (idx == 1) return texture2D(u_atlas1, uv).rgb;
    if (idx == 2) return texture2D(u_atlas2, uv).rgb;
    if (idx == 3) return texture2D(u_atlas3, uv).rgb;
    return texture2D(u_atlas4, uv).rgb;
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

  /** 1 inside a band of width w centred on d = 0, with a one-device-pixel soft edge. */
  float band(float d, float w, float aa) {
    return 1.0 - smoothstep(0.5 * w - 0.5 * aa, 0.5 * w + 0.5 * aa, abs(d));
  }

  void main() {
    // Colours are authored in sRGB; ShaderMaterial does not apply the linear->sRGB output
    // conversion, so the literal values go straight to the framebuffer.
    // Everything below is in CSS px from the sprite centre (y down), so it is the same at every dpr.
    vec2 p = (gl_PointCoord - vec2(0.5)) * v_quadCss;
    float aa = 1.0 / max(u_pixelRatio, 0.0001);   // one device pixel

    // The dot or cover: a rounded box whose corner shrinks from a full circle (dot) to 2 px (cover).
    float halfSize = 0.5 * v_baseCss;
    float corner = mix(halfSize, min(halfSize, 2.0), v_coverT);
    vec2 q = abs(p) - vec2(halfSize - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float mask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sd);

    vec3 col = clusterColor(int(v_clusterId));
    if (v_coverT > 0.0) {
      vec2 local = clamp(p / max(v_baseCss, 0.0001) + 0.5, 0.0, 1.0);
      col = mix(col, sampleAtlas(int(v_atlasIndex), v_atlasOrigin + local * v_atlasSize), v_coverT);
    }
    float alpha = mask * mix(u_dotAlpha, 1.0, v_coverT);
    if (v_dim > 0.5) alpha *= u_focusDim;
    // Only the cover part dims, so dots stay as they are.
    if (v_selDim > 0.5) alpha *= mix(1.0, u_selDim, v_coverT);
    if (v_sel > 0.5) {
      // Mockup: a 1 px room-coloured backing around the cover, then a 2 px lamp frame 4 px outside it.
      float back = 1.0 - smoothstep(1.0 - 0.5 * aa, 1.0 + 0.5 * aa, squareSd(p, halfSize));
      col = mix(ROOM, col, mask);
      alpha = max(alpha, back);
      float a = band(squareSd(p, halfSize + ${f(SELECTED_FRAME_GAP_PX)}), ${f(SELECTED_FRAME_PX)}, aa);
      float outA = a + alpha * (1.0 - a);
      col = (LAMP * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
      alpha = outA;
    }
    if (v_anchor > 0.5) {
      col = PAPER;
      alpha = mask * 0.8;
    }

    if (v_hovered > 0.5) {
      // A 1.5 px stroke v_markGap outside the drawn shape: a circle around a dot (radius 7), a square
      // with sharp corners around a full cover, following the shape through the cross-fade.
      float markHalf = halfSize + v_markGap;
      float markCorner = mix(markHalf, 0.0, v_coverT);
      vec2 mq = abs(p) - vec2(markHalf - markCorner);
      float msd = length(max(mq, 0.0)) + min(max(mq.x, mq.y), 0.0) - markCorner;
      // In dot mode a paper core dot covers the album, fading out as the cover fades in.
      float coreR = max(0.5 * v_dotCss, 2.2);
      float core = (1.0 - smoothstep(coreR - 0.5 * aa, coreR + 0.5 * aa, length(p))) * (1.0 - smoothstep(0.0, 0.5, v_coverT));
      float a = max(band(msd, 1.5, aa), core) * mix(0.95, 0.9, v_coverT);
      float outA = a + alpha * (1.0 - a);
      col = (PAPER * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
      alpha = outA;
    }
    // Fully transparent texels must not write depth over their neighbours.
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;
