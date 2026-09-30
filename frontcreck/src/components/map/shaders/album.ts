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
 * the base size times `scale` (0.85 for albums outside the focus), then the
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
    float layer = 0.0;
    if (u_focusedAlbumIndex >= 0.0 && isHighlighted(instanceIndex)) layer = 0.1;
    if (abs(u_hoverIndex - instanceIndex) < 0.5) layer = 0.2;
    if (abs(u_focusedAlbumIndex - instanceIndex) < 0.5) layer = 0.3;

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
        v_dim = 1.0;
        baseCss *= 0.85;
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5) ? 1.0 : 0.0;
    // Hovered: room for the mockup's marks, a ring of radius 7 around a dot, or a square stroke 3 px
    // outside a cover.
    float quadCss = v_hovered > 0.5 ? (coverT >= 0.98 ? baseCss + 8.0 : max(baseCss * 1.25, 17.0)) : baseCss;
    // Clamp at 240 device-px (most GPUs cap GL_POINTS sprites around 256) and at u_maxSpritePx (a
    // viewport-relative cap so a single cover never dominates a short window).
    float capCss = min(240.0, u_maxSpritePx) / u_pixelRatio;
    if (quadCss > capCss) {
      baseCss *= capCss / quadCss;
      quadCss = capCss;
    }
    gl_PointSize = quadCss * u_pixelRatio;

    v_coverT = coverT;
    v_baseCss = baseCss;
    v_quadCss = quadCss;
    v_dotCss = dotCss;
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

  const vec3 PAPER = vec3(0.929, 0.898, 0.835); // #ede5d5

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
    if (v_anchor > 0.5) {
      col = PAPER;
      alpha = mask * 0.8;
    }

    if (v_hovered > 0.5) {
      float over;
      float overAlpha;
      if (v_coverT >= 0.98) {
        // 1.5 px square stroke 3 px outside the cover
        over = band(max(abs(p.x), abs(p.y)) - (halfSize + 3.0), 1.5, aa);
        overAlpha = 0.9;
      } else {
        // paper core dot and a 1.5 px ring of radius 7, transparent between them
        float d = length(p);
        float core = 1.0 - smoothstep(max(0.5 * v_dotCss, 2.2) - 0.5 * aa, max(0.5 * v_dotCss, 2.2) + 0.5 * aa, d);
        over = max(core, band(d - 7.0, 1.5, aa));
        overAlpha = 0.95;
      }
      float a = over * overAlpha;
      float outA = a + alpha * (1.0 - a);
      col = (PAPER * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
      alpha = outA;
    }
    // Fully transparent texels must not write depth over their neighbours.
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;
