import { FRAME_RGB, GAS_LUM_MAX } from "../theme";
import { DOT_AT_OVERVIEW, STAR_UNDER_HOLD, STAR_UNDER_MAX } from "../state/stars";
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
 * Sprite sizes (see state/zoomLimits.ts): the album's body is a dot of 3 to 7 CSS px that grows gently with the
 * map scale, cross-fading to a cover whose size is linear in the map scale (COVER_WORLD world units, 16 to 32
 * CSS px during the fade, at most 64). While it is a dot, what is drawn is a star inside that dot size
 * (state/stars.ts) with a soft glow around it; the star fades out as the cover fades in. An album whose atlas
 * sheet has not loaded yet stays a star.
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
 * it so both track the sprite on screen at every zoom. The dimmed map's MUTED_DOT_SCALE is not mirrored here:
 * the dimmed map (Home, About, 404) takes no pointer input, so nothing hit-tests it.
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
/** Alpha of the dots at the overview, and on the dimmed Home, About and 404 map (mockup .78 and .34). */
export const DOT_ALPHA = 0.78;
export const DOT_ALPHA_DIMMED = 0.34;
/** The dimmed map draws its dots this much larger (mockup `muted`: radius * 1.35), easing with the alpha. */
export const MUTED_DOT_SCALE = 1.35;

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
const v3 = (c: readonly number[]) => `vec3(${c.map((v) => f(v / 255)).join(", ")})`;

/** The page colour (#07060a): the 1 px backing round the picked cover. */
const BACKING_RGB = [7, 6, 10] as const;
/** The dark casing under white marks, the same as the focus lines' casing (rgb 6, 6, 10). */
const CASING_RGB = [6, 6, 10] as const;

export const ALBUM_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_pos_sonic;
  attribute vec2 a_pos_balanced;
  attribute vec2 a_pos_mood;
  attribute vec4 a_atlasUV;       // (u, v, w, h)
  attribute float a_atlasIndex;   // float so vertex attribs work
  attribute vec4 a_star;          // class radius (CSS px at Overview), glow, alpha, halo reach in radii
  attribute vec3 a_tint;          // star colour (sRGB, 0..1)
  attribute vec3 a_bg;            // gas luminance under the album at sonic, balanced, mood (0..1 of GAS_LUM_MAX)

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
  uniform float u_dotAlpha;     // eases from DOT_ALPHA to DOT_ALPHA_DIMMED as the map dims

  varying vec4 v_atlasRect;     // atlas cell: origin.xy, size.zw
  varying float v_atlasIndex;
  varying float v_dim;          // 1 = outside the focus in album view
  varying float v_hovered;      // 1 = this instance is the hover target
  varying float v_anchor;       // 1 = focus album, drawn as a small ring under its DOM cover
  varying float v_coverT;       // 0 = star, 1 = cover fully shown
  varying vec4 v_size;          // CSS px: body (dot or cover), point sprite, dot at this zoom, hover mark gap
  varying float v_sel;          // 1 = the picked album, drawn large and framed (cover mode)
  varying float v_selDim;       // 1 = another album while one is picked
  varying vec4 v_star;          // core radius and light reach (CSS px), glow, wide-halo amount
  varying vec4 v_tint;          // star colour, star alpha
  varying float v_under;        // alpha of the dark under-disc

  vec2 interpolatePos() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_pos_sonic, a_pos_balanced, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_pos_balanced, a_pos_mood, t);
  }

  // The same piecewise rule as the positions, so the under-disc follows the gas through a slider morph.
  float interpolateBg() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_bg.x, a_bg.y, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_bg.y, a_bg.z, t);
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
    // Star scale (state/stars.ts): the dot rule relative to its value at Overview, before the dimmed enlargement.
    float sizeK = dotCss / ${f(DOT_AT_OVERVIEW)};
    // The dimmed backdrop (Home, About, 404) draws larger, fainter stars (mockup muted), eased with the alpha.
    float mutedT = clamp((${f(DOT_ALPHA)} - u_dotAlpha) / ${f(DOT_ALPHA - DOT_ALPHA_DIMMED)}, 0.0, 1.0);
    dotCss *= 1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT;
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

    // The star: core radius, how far its light reaches, and the dark disc the gas behind it needs.
    float r = a_star.x * sizeK * (1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT);
    float faint = min(1.0, r / 0.8);   // a star smaller than 0.8 px is drawn at 0.8 px, fainter
    r = max(r, 0.8);
    float haloT = smoothstep(5.0, 7.0, coverCss);   // no wide halos while the map is zoomed far out
    float wideStar = step(3.0, a_star.w);           // the two brightest classes
    float reach = r * mix(2.6, a_star.w, haloT) + 1.0;
    float under = clamp(1.0 - ${f(STAR_UNDER_HOLD)} / max(interpolateBg() * ${f(GAS_LUM_MAX)}, 0.001), 0.0, ${f(STAR_UNDER_MAX)});
    float starA = a_star.z * faint * (1.0 - coverT) * clamp(sizeK * sizeK, 0.45, 1.0) * (u_dotAlpha / ${f(DOT_ALPHA)});
    // Depth rule: only layer-0 sprites reach past their own shape. An elevated sprite (focus, hover, picked)
    // writes a nearer depth wherever it is not discarded, so a glow on it would hide its neighbours.
    if (layer > 0.0) {
      starA = 0.0;
      under = 0.0;
    }

    v_dim = 0.0;
    v_anchor = 0.0;
    if (u_focusedAlbumIndex >= 0.0) {
      if (isHighlighted(instanceIndex)) {
        v_anchor = 1.0;   // focus albums are drawn as DOM covers; the point is a small ring on the true position
        baseCss = 12.0;
        coverT = 0.0;
      } else {
        v_dim = 1.0;   // same size as in the overview (mockup), only fainter
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5 && v_sel < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) baseCss = max(baseCss * ${f(SELECTED_SCALE)}, ${f(SELECTED_MIN_PX)});
    // Hover mark (mockup): a ring of radius 7 around a dot, a square stroke 3 px outside a cover, and in
    // between a stroke that follows the drawn shape at a gap that shrinks to 3 px. The sprite grows to hold it
    // and its dark casing (2 px either side of the stroke's centre).
    float markGap = mix(max(7.0 - 0.5 * baseCss, 3.0), 3.0, coverT);
    float quadCss = v_hovered > 0.5 ? max(baseCss + 2.0 * markGap + 6.0, 21.0) : baseCss;
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
    // The quad is only as large as the star needs: its light's reach, or the under-disc (gone at 3 r + 1).
    float starQuad = starA > 0.003 ? 2.0 * (max(reach, under > 0.0 ? 3.0 * r + 1.0 : 0.0) + 1.0) : 0.0;
    quadCss = min(max(quadCss, starQuad), capCss);
    gl_PointSize = quadCss * u_pixelRatio;

    v_coverT = coverT;
    v_size = vec4(baseCss, quadCss, dotCss, markGap);
    v_atlasRect = a_atlasUV;
    v_atlasIndex = a_atlasIndex;
    v_star = vec4(r, reach, a_star.y * mix(1.0, mix(0.3, 1.0, haloT), wideStar), wideStar * haloT);
    v_tint = vec4(a_tint, starA);
    v_under = under;
  }
`;

export const ALBUM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_atlas0;
  uniform sampler2D u_atlas1;
  uniform sampler2D u_atlas2;
  uniform sampler2D u_atlas3;
  uniform sampler2D u_atlas4;
  uniform float u_pixelRatio;
  uniform float u_dotAlpha;   // 0.78, 0.34 when the map is dimmed (the tile's alpha at the start of the cross-fade, as before the theme)
  uniform float u_focusDim;   // alpha factor of stars and covers outside the focus
  uniform float u_selDim;     // alpha factor of the other covers while an album is picked

  const vec3 FRAME = ${v3(FRAME_RGB)};
  const vec3 BACKING = ${v3(BACKING_RGB)};
  const vec3 CASING = ${v3(CASING_RGB)};

  varying vec4 v_atlasRect;
  varying float v_atlasIndex;
  varying float v_dim;
  varying float v_hovered;
  varying float v_anchor;
  varying float v_coverT;
  varying vec4 v_size;
  varying float v_sel;
  varying float v_selDim;
  varying vec4 v_star;
  varying vec4 v_tint;
  varying float v_under;

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

  /** 1 inside a band of width w centred on d = 0, with a one-device-pixel soft edge. */
  float band(float d, float w, float aa) {
    return 1.0 - smoothstep(0.5 * w - 0.5 * aa, 0.5 * w + 0.5 * aa, abs(d));
  }

  /** Colour c at coverage a over (col, alpha), both straight alpha. */
  void over(inout vec3 col, inout float alpha, vec3 c, float a) {
    float outA = a + alpha * (1.0 - a);
    col = (c * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
    alpha = outA;
  }

  void main() {
    // Colours are authored in sRGB; ShaderMaterial does not apply the linear->sRGB output
    // conversion, so the literal values go straight to the framebuffer.
    // Everything below is in CSS px from the sprite centre (y down), so it is the same at every dpr.
    vec2 p = (gl_PointCoord - vec2(0.5)) * v_size.y;
    float aa = 1.0 / max(u_pixelRatio, 0.0001);   // one device pixel
    float d = length(p);

    // The star: a crisp core with a bloom that falls to nothing at its reach (light, added), and under it a
    // dark disc, strongest out to 0.8 r and gone by 3 r + 1 (alpha only). Both are zero on elevated sprites.
    float starA = v_tint.a * (v_dim > 0.5 ? u_focusDim : 1.0);
    float light = 0.0;
    float under = 0.0;
    if (starA > 0.0) {
      float r = v_star.x;
      float win = clamp(1.0 - d / v_star.y, 0.0, 1.0);
      float core = 1.0 - smoothstep(r - 0.6 * aa, r + 0.6 * aa, d);
      float x = d / r;
      float bloom = v_star.z * (0.5 * exp(-x * x * 0.3) + 0.2 * v_star.w * exp(-x * x * 0.045)) * win * win;
      light = (core + bloom * (1.0 - core)) * starA;
      float fall = clamp(1.0 - (d - r * 0.8) / (r * 2.2 + 1.0), 0.0, 1.0);
      under = v_under * min(1.0, starA * 1.4) * fall * fall;
    }

    // The album's body: a rounded box whose corner shrinks from a full circle (dot size) to 2 px (cover).
    float halfSize = 0.5 * v_size.x;
    float corner = mix(halfSize, min(halfSize, 2.0), v_coverT);
    vec2 q = abs(p) - vec2(halfSize - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float mask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sd);

    vec3 col = BACKING;
    float alpha = 0.0;
    if (v_coverT > 0.0) {
      vec2 local = clamp(p / max(v_size.x, 0.0001) + 0.5, 0.0, 1.0);
      // The cross-fade band, as before the theme: a rounded tile that starts as the album's own colour (its
      // star colour, where the cluster colour used to be) and gains its image, 78% to 100% opaque, so a pile
      // of half-faded covers reads as soft, overlapping tinted tiles.
      col = mix(v_tint.rgb, sampleAtlas(int(v_atlasIndex), v_atlasRect.xy + local * v_atlasRect.zw), v_coverT);
      // A 1 px dark keyline just inside the edge keeps a pale cover apart from bright gas; it comes in with the image.
      col = mix(col, CASING, 0.9 * v_coverT * smoothstep(-1.0 - 0.5 * aa, -1.0 + 0.5 * aa, sd));
      // Today's alpha, eased in over the first eighth of the fade: the star under it is smaller than the old dot.
      alpha = mask * mix(u_dotAlpha, 1.0, v_coverT) * smoothstep(0.0, 0.125, v_coverT);
      // A cover that steps back turns see-through, exactly as before the theme: outside an open album's focus,
      // and (the cover part only) while another album is picked. Where two such covers overlap, the lower one
      // shows through the upper.
      if (v_dim > 0.5) alpha *= u_focusDim;
      if (v_selDim > 0.5) alpha *= mix(1.0, u_selDim, v_coverT);
    }
    if (v_sel > 0.5) {
      // As before the theme: a 1 px page-coloured backing round the cover, then a 2 px frame 4 px outside it.
      // The map shows through the gap between the two.
      float back = 1.0 - smoothstep(1.0 - 0.5 * aa, 1.0 + 0.5 * aa, squareSd(p, halfSize));
      col = mix(BACKING, col, mask);
      alpha = max(alpha, back);
      over(col, alpha, FRAME, band(squareSd(p, halfSize + ${f(SELECTED_FRAME_GAP_PX)}), ${f(SELECTED_FRAME_PX)}, aa));
    }
    if (v_anchor > 0.5) {
      // A hollow ring on the album's true position (a filled dot would read as a bright star).
      float ring = d - 3.4;
      col = CASING;
      alpha = band(ring, 3.5, aa) * 0.8;
      over(col, alpha, FRAME, band(ring, 1.3, aa));
    }

    if (v_hovered > 0.5) {
      // A 1.5 px stroke v_size.w outside the drawn shape, on a dark casing: a circle around a star (radius
      // 7), a square with sharp corners around a full cover, following the shape through the cross-fade.
      float markHalf = halfSize + v_size.w;
      float markCorner = mix(markHalf, 0.0, v_coverT);
      vec2 mq = abs(p) - vec2(markHalf - markCorner);
      float msd = length(max(mq, 0.0)) + min(max(mq.x, mq.y), 0.0) - markCorner;
      // In star mode a core dot stands for the album, fading out as the cover fades in.
      float coreR = max(0.5 * v_size.z, 2.2);
      float core = (1.0 - smoothstep(coreR - 0.5 * aa, coreR + 0.5 * aa, d)) * (1.0 - smoothstep(0.0, 0.5, v_coverT));
      over(col, alpha, CASING, band(msd, 4.0, aa) * 0.8);
      over(col, alpha, FRAME, max(band(msd, 1.5, aa), core) * mix(0.95, 0.9, v_coverT));
    }

    // Premultiplied output (blend One, OneMinusSrcAlpha): the album's shape over the star's light, and the
    // under-disc as alpha with no colour, so it only darkens what is behind it.
    vec3 rgb = col * alpha + v_tint.rgb * light * (1.0 - alpha);
    float a = alpha + under * (1.0 - alpha);
    // Nothing here: write no colour and no depth.
    if (a < 0.004 && max(rgb.r, max(rgb.g, rgb.b)) < 0.004) discard;
    gl_FragColor = vec4(rgb, a);
  }
`;
