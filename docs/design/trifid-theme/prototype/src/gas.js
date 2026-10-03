/* The gas: the mockup's Canvas 2D recipe (mockups/src/trifid.js) as a WebGL2 fragment shader over field textures
 * built on the CPU at load. Beauty first: one continuous cloud whose brightness and colour swirl through a strong
 * domain warp. What stays honest:
 *   - colour comes from the albums near (family weights, a tight blur blended with a wide one);
 *   - light and colour fade to dark neutral sky away from the albums, through blurred density only (no edge, no box);
 *   - nothing moves at rest: the gas is drawn into an offscreen target only when the camera or the state changes.
 * Default path: each stop is rendered once to a texture (the bake) and that texture is drawn per frame; gas=live runs
 * the full shader per frame. Both end in the same finish() so they match.
 * Hash switches read here: look=<id>, scheme=<id>, palette=<id>, gasonly=1 (debug). */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, G = C.GAS;
  const Gas = (RMR.Gas = { ok: false, lastMs: 0 });
  const param = (k) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };

  /* Looks. `mockup` is the recipe of mockups/src/trifid.js with four corrections (far field ends in dark sky, large dust
   * blots on dense fields softened, a small density warp so the cloud's edge is wispy, the colour field advected by
   * the flow). The others move these numbers:
   *   WARP   amplitude of the domain warp of the luminance noise (the swirl)            W2    second warp level (marbling)
   *   TEX    luminance = lit * (TEX[0] + TEX[1] * b^TEX[2]), b the warped noise 0..1     FIL   bright thin filaments
   *   CW     colour advection in raw units per unit of flow: [broad, fine]               DW    density warp (wispy edges)
   *   DUST   darkness of the lanes; DSOFT how much the lanes thin out on dense star fields; DFINE the share of the fine lanes
   *   GLOW   additive blurred copy                                                       EX    exposure of the tone map
   *   P      sharpening of the family shares (higher = purer hues, harder borders)      SAT   chroma gain
   *   FAR    gain of the far, thin gas                                  CORE, HI  cream cores on dense spots, warm lift on the brightest gas */
  const LOOKS = {
    mockup: { WARP: 2.8, W2: 0, TEX: [0.32, 1.92, 2], FIL: 0, CW: [0.3, 0.05], DW: 0.1, DUST: 0.9, DSOFT: 0.55, DFINE: 0.5, GLOW: 0.18, EX: 1.3, P: 2.3, SAT: 1, FAR: 1, CORE: 0.08, HI: 0.36 },
    swirl: { WARP: 3.4, W2: 1.6, TEX: [0.3, 2.0, 2], FIL: 0.5, CW: [0.42, 0.16], DW: 0.14, DUST: 0.8, DSOFT: 0.7, DFINE: 0.7, GLOW: 0.18, EX: 1.18, P: 2.6, SAT: 1.05, FAR: 1, CORE: 0.07, HI: 0.25 },
    photo: { WARP: 2.4, W2: 0.6, TEX: [0.42, 1.45, 1.6], FIL: 0.2, CW: [0.34, 0.08], DW: 0.16, DUST: 0.32, DSOFT: 0.85, DFINE: 0.3, GLOW: 0.3, EX: 1.12, P: 2.0, SAT: 0.95, FAR: 0.6, CORE: 0.09, HI: 0.2 },
    marble: { WARP: 3.0, W2: 2.6, TEX: [0.36, 1.7, 1.7], FIL: 0.9, CW: [0.5, 0.26], DW: 0.18, DUST: 0.45, DSOFT: 0.8, DFINE: 1.0, GLOW: 0.2, EX: 1.02, P: 3.2, SAT: 1.12, FAR: 0.8, CORE: 0.06, HI: 0.15 },
  };
  /* Palettes for the default five families (fierce, warm, quiet, dark, urban) and the neutral of thin or mixed gas. */
  const PALETTES = {
    mockup: { hues: [[236, 72, 96], [246, 172, 60], [46, 186, 164], [60, 116, 244], [196, 92, 232]], neutral: [150, 140, 138] },
    emission: { hues: [[255, 56, 112], [255, 150, 58], [40, 200, 190], [36, 70, 230], [168, 70, 255]], neutral: [150, 132, 140] },
    dusty: { hues: [[214, 120, 132], [214, 170, 104], [128, 176, 150], [98, 124, 178], [170, 128, 186]], neutral: [146, 140, 136] },
    hubble: { hues: [[206, 84, 52], [240, 186, 84], [60, 190, 186], [70, 120, 200], [150, 170, 214]], neutral: [140, 142, 146] },
    ember: { hues: [[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]], neutral: [138, 138, 146] },
  };
  let gl, canvas, progGas, progBaked, progBlit, vao, noiseTex, target = null, lastKey = '', L;
  const fields = {}, baked = {}, lum = {}, rgb = {}; let BAKE_HALF = 1.6;

  /** The colour scheme in use: 7 weights per album (up to six channels, then the neutral share), the channel hues and
   * the neutral. Default: the five families of regions/colour.json. scheme=<id> takes a set from data/schemes.js. */
  function pickScheme() {
    const D = RMR.D, n = D.n, w = new Float32Array(7 * n), all = (window.RMR_SCHEMES && window.RMR_SCHEMES.schemes) || [];
    const sc = all.find((s) => s.id === param('scheme')) || null, pid = param('palette');
    let pal;
    if (sc) {
      let mx = 0; for (let i = 0; i < sc.weights.length; i++) if (sc.weights[i] > mx) mx = sc.weights[i];
      const k = mx > 1.5 ? 0.01 : 1;   // weights may be stored as 0..100
      for (let i = 0; i < n; i++) { const r = D.real(i); for (let j = 0; j < 7; j++) w[7 * i + j] = (sc.weights[7 * r + j] || 0) * k; }
      pal = sc.palettes.find((p) => p.id === pid) || sc.palettes[0];
    } else {
      for (let i = 0; i < n; i++) { for (let j = 0; j < 5; j++) w[7 * i + j] = D.w[6 * i + j]; w[7 * i + 6] = D.w[6 * i + 5]; }
      pal = PALETTES[pid] || PALETTES.mockup;
    }
    const hues = pal.hues.slice(0, 6); while (hues.length < 6) hues.push(pal.neutral);
    // leading channel per album (or -1: weak fit, or neutral leads), for the tint of its star
    const lead = new Int8Array(n);
    for (let i = 0; i < n; i++) { let m = 0, mj = -1; for (let j = 0; j < 6; j++) if (w[7 * i + j] > m) { m = w[7 * i + j]; mj = j; } lead[i] = m > 0.3 && m > w[7 * i + 6] ? mj : -1; }
    return { id: sc ? sc.id : 'families', palette: pal.id || (PALETTES[pid] ? pid : 'mockup'), w, lead, hues, neutral: pal.neutral, guard: sc ? sc.guard_pairs || [] : [] };
  }
  Gas.schemes = () => [{ id: 'families', palettes: Object.keys(PALETTES) }].concat(((window.RMR_SCHEMES && window.RMR_SCHEMES.schemes) || []).map((s) => ({ id: s.id, name: s.name, palettes: s.palettes.map((p) => p.id) })));

  // ---------- CPU fields ----------
  function blur(d, w, h, sigmaCells) {   // three box passes, as the mockup
    const r = Math.max(1, Math.round(sigmaCells)), t = new Float32Array(w * h), inv = 1 / (2 * r + 1);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += d[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[o + x] = s * inv; s += d[o + Math.min(w - 1, x + r + 1)] - d[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { d[y * w + x] = s * inv; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    }
    return d;
  }
  function at(d, n, gx, gy) {
    gx = U.clamp(gx, 0, n - 1.001); gy = U.clamp(gy, 0, n - 1.001); const xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, o = yi * n + xi;
    return d[o] * (1 - fx) * (1 - fy) + d[o + 1] * fx * (1 - fy) + d[o + n] * (1 - fx) * fy + d[o + n + 1] * fx * fy;
  }
  /** Album density at five blurs and the seven colour weights at two, for one stop, normalised by percentiles taken at
   * the album positions (so the rule is the same at 4,000 or 10,000 points), packed into five RGBA float textures:
   *   0: fine, big, huge, far      1: local weights 0..3      2: local 4, 5, neutral; very far
   *   3: wide weights 0..3         4: wide 4, 5, neutral */
  function buildFields(stop) {
    const D = RMR.D, n = G.GRID, N = D.n, raw = D.raw[stop], cell = (2 * G.RAW_HALF) / n, B = G.BLUR, W = Gas.scheme.w;
    const g = new Float32Array(n * n), w7 = [0, 1, 2, 3, 4, 5, 6].map(() => new Float32Array(n * n));
    const gxs = new Float32Array(N), gys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const gx = (raw[2 * i] + G.RAW_HALF) / cell - 0.5, gy = (raw[2 * i + 1] + G.RAW_HALF) / cell - 0.5; gxs[i] = gx; gys[i] = gy;
      const xi = Math.floor(gx), yi = Math.floor(gy); if (xi < 0 || yi < 0 || xi >= n - 1 || yi >= n - 1) continue;
      const fx = gx - xi, fy = gy - yi, o = yi * n + xi, k = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], oo = [o, o + 1, o + n, o + n + 1];
      for (let c = 0; c < 4; c++) { g[oo[c]] += k[c]; for (let j = 0; j < 7; j++) w7[j][oo[c]] += k[c] * W[7 * i + j]; }
    }
    const mk = (src, sigma) => blur(Float32Array.from(src), n, n, sigma / cell);
    const fine = mk(g, B.fine), big = mk(g, B.big), huge = mk(g, B.huge), far = mk(g, B.far), vfar = mk(g, B.vfar);
    const wide = w7.map((q) => mk(q, B.wide)); w7.forEach((q) => blur(q, n, n, B.col / cell));
    const pct = (d, q) => { const v = []; for (let i = 0; i < N; i += 2) v.push(at(d, n, gxs[i], gys[i])); v.sort((a, b) => a - b); return v[Math.floor(v.length * q)] || 1e-6; };
    const nb = pct(big, 0.6), nh = pct(huge, 0.6), nf = pct(fine, 0.85), nfar = pct(far, 0.5), nvf = pct(vfar, 0.5);
    const T = [0, 1, 2, 3, 4].map(() => new Float32Array(4 * n * n));
    for (let i = 0; i < n * n; i++) {
      const o = 4 * i;
      T[0][o] = fine[i] / nf; T[0][o + 1] = big[i] / nb; T[0][o + 2] = huge[i] / nh; T[0][o + 3] = far[i] / nfar;
      for (let j = 0; j < 4; j++) { T[1][o + j] = w7[j][i] / nb; T[3][o + j] = wide[j][i] / nh; }
      for (let j = 0; j < 3; j++) { T[2][o + j] = w7[4 + j][i] / nb; T[4][o + j] = wide[4 + j][i] / nh; }
      T[2][o + 3] = vfar[i] / nvf;
    }
    return T.map((data) => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    });
  }

  // ---------- shaders ----------
  const VS = `#version 300 es
  in vec2 a_p; uniform vec4 u_rect; out vec2 v_raw; out vec2 v_uv;
  void main(){ v_uv=a_p*.5+.5; v_raw=mix(u_rect.xy,u_rect.zw,v_uv); gl_Position=vec4(a_p,0.,1.); }`;
  const f = (v) => { const s = Number(v).toFixed(4); return s.indexOf('.') < 0 ? s + '.' : s; };

  /* The last step of both paths. c: the toned gas (display values, no sky base); A: what the dust lets through.
   * The tone map is 1 - exp(-EX * light), so scaling the light by k before it is 1 - (1 - c)^k after it: dust (which
   * fades out with zoom, u_dust), the zoom-band strength and the pool around an open album's group are all applied
   * that way, exactly as the mockup dims the light itself. Then the sky base and a little grain. */
  const FINISH = `
  uniform float u_strength, u_dust, u_poolAmt; uniform vec3 u_pool;
  const vec3 SKY=vec3(.024,.022,.034);
  vec3 finish(vec3 c,float A,vec2 raw){
    float k=u_strength*mix(1.,A,u_dust), des=0.;
    if(u_poolAmt>0.){ vec2 dd=(raw-u_pool.xy)/u_pool.z; float e=exp(-dot(dd,dd)*.5); k*=mix(1.,mix(.6,.25,e),u_poolAmt); des=.5*e*u_poolAmt; }
    c=1.-pow(max(1.-c,vec3(.002)),vec3(k));
    c=mix(c,vec3((c.r+c.g+c.b)/3.),des);
    float n=(texelFetch(u_noise,ivec2(gl_FragCoord.xy)&255,0).r-.5)*.012;
    return SKY+c+n;
  }`;

  const FS_GAS = () => `#version 300 es
  precision highp float;
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_noise, u_a0, u_a1, u_a2, u_a3, u_a4, u_b0, u_b1, u_b2, u_b3, u_b4;
  uniform float u_mix, u_ppr, u_bake;
  uniform vec3 u_hue[6]; uniform vec3 u_neu;
  const float HALF=${f(G.RAW_HALF)}, F=5.;
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  // value noise from the mockup's 256 px random table; the smoothstep fraction makes LINEAR filtering do the interpolation
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  float fbm4(vec2 p){ float s=0.,a=.5,f=1.; for(int i=0;i<4;i++){ s+=a*vn(p*f+vec2(17.3,9.1)*float(i)); a*=.5; f*=2.03; } return s; }
  // The mockup's fbmG (gain .6, lacunarity 2.07, normalised to 0..1). An octave only counts once its cells are a few
  // pixels wide: no shimmer when zoomed out, and octaves beyond the mockup's 'base' fade in when zoomed in.
  float fbmG(vec2 p,float k,int base,int total){
    float s=0.,a=1.,f=1.,n=0.;
    for(int i=0;i<total;i++){
      float cellPx=u_ppr/(F*k*f), fade=sm(1.5,4.,cellPx);
      if(i<base) n+=a;
      if(fade>0.) s+=a*fade*(i<base?1.:1.8)*(vn(p*f+vec2(17.3,9.1)*float(i))-.5);
      a*=.6; f*=2.07;
    }
    return s/n+.5;
  }
  // The mockup's famCol over up to six channels: shares raised to a power, so the leading channel takes the hue and
  // neighbours bleed in; weak fits (no channel leads) and the neutral share lose colour. A scheme may name guard
  // pairs: two channels whose blend would read as a third channel's hue. There the stronger takes the hue and the
  // tie goes dusky instead.
  vec3 famCol(vec4 a,vec3 b){
    float w[6]; w[0]=max(a.x,0.); w[1]=max(a.y,0.); w[2]=max(a.z,0.); w[3]=max(a.w,0.); w[4]=max(b.x,0.); w[5]=max(b.y,0.);
    float s=0., t=0., m=0.; float q[6];
    for(int j=0;j<6;j++){ s+=w[j]; }
    if(s<1e-9) return u_neu;
    for(int j=0;j<6;j++){ q[j]=pow(w[j]/s,${f(L.P)}); t+=q[j]; }
    for(int j=0;j<6;j++) q[j]/=t;
    float dusk=0.;
    ${Gas.scheme.guard.map(([i, j]) => `{ float g=q[${i}]+q[${j}]; if(g>1e-5){ float sh=sm(.3,.7,q[${i}]/g); q[${i}]=g*sh; q[${j}]=g*(1.-sh); dusk+=4.*sh*(1.-sh)*g; } }`).join('\n    ')}
    vec3 c=vec3(0.);
    for(int j=0;j<6;j++){ m=max(m,q[j]); c+=u_hue[j]*q[j]; }
    float neu=max(b.z,0.)/(s+max(b.z,0.)+1e-9), sat=min(1.,(.25+1.05*m)*${f(L.SAT)})*(1.-.7*neu)*(1.-.4*min(dusk,1.));
    return mix(u_neu,c,sat);
  }
  void main(){
    vec2 p=vec2(v_raw.x*F+20.,-v_raw.y*F+20.);
    // the flow: a slow vector field q; every noise lookup below is displaced along it, which is what makes the swirl
    vec2 q=vec2(fbm4(p+vec2(1.7,9.2))-.47, fbm4(p+vec2(8.3,2.8))-.47);
    vec2 pw=p*1.25+q*${f(L.WARP)};
    // a second, finer vector that lives in the warped space: it marbles the luminance (W2) and carries the colour (CW)
    vec2 r=vec2(fbmG(pw+vec2(31.,77.),1.25,4,4), fbmG(pw+vec2(63.,12.),1.25,4,4))-.5;
    float b=fbmG(pw+r*${f(L.W2)},1.25,6,8);
    float tex=${f(L.TEX[0])}+${f(L.TEX[1])}*pow(clamp(b,0.,1.),${f(L.TEX[2])});
    ${L.FIL > 0 ? `float fold=1.-abs(2.*fbmG(p*2.7+q*4.2+r*1.5+vec2(31.,77.),2.7,5,7)-1.); fold*=fold; tex*=1.+${f(L.FIL)}*(fold*fold-.22);` : ''}
    // fields: the fine density is read where it is (cores stay on their stars); the wider ones through a small warp so
    // the cloud's edge is wisps, not a round blur; the colour weights through the flow, so colours swirl and interleave
    vec2 uv=(v_raw+HALF)/(2.*HALF), fl=vec2(q.x,-q.y), fr=vec2(r.x,-r.y);
    vec2 uvw=uv+fl*${f(L.DW / 1)}/(2.*HALF), uvc=uv+(fl*${f(L.CW[0])}+fr*${f(L.CW[1])})/(2.*HALF);
    vec4 d1=texture(u_a0,uv), d0=texture(u_a0,uvw), w1a=texture(u_a1,uvc), w1b=texture(u_a2,uvc), w2a=texture(u_a3,uvc), w2b=texture(u_a4,uvc); float dV=texture(u_a2,uvw).a;
    if(u_mix>0.){ d1=mix(d1,texture(u_b0,uv),u_mix); d0=mix(d0,texture(u_b0,uvw),u_mix); w1a=mix(w1a,texture(u_b1,uvc),u_mix); w1b=mix(w1b,texture(u_b2,uvc),u_mix); w2a=mix(w2a,texture(u_b3,uvc),u_mix); w2b=mix(w2b,texture(u_b4,uvc),u_mix); dV=mix(dV,texture(u_b2,uvw).a,u_mix); }
    float dF=min(2.,d1.r), dB=d0.g, dH=d0.b, dFar=d0.a;
    // lit gas wherever albums are, a thin far field around them, and nothing beyond: env is 0 in empty sky, so the
    // cloud ends in the plain dark sky that also lies beyond the bake, with no outline
    float near=sm(.02,1.6,dB*.7+dH*.55), env=sm(.02,.55,dFar);
    float lit=near*.84+${f(L.FAR)}*(.2*sm(.05,1.3,dFar)+(.085*sm(0.,1.1,dV)+.03)*env);
    float Lm=lit*tex;
    // colour from the weights: local where albums are, the wider average further out, neutral in the far field
    float s1=dot(w1a,vec4(1.))+dot(w1b.xyz,vec3(1.)), s2=dot(w2a,vec4(1.))+dot(w2b.xyz,vec3(1.));
    vec3 c=u_neu;
    if(s2>1e-7){ c=famCol(w2a,w2b.xyz); if(s1>1e-7) c=mix(c,famCol(w1a,w1b.xyz),sm(0.,.1,s1)); c=mix(u_neu,c,sm(.02,.45,dFar)); }
    // dust: thin, sharp, dark lanes that only show against bright gas; atmosphere, shaped by the same flow.
    // The broad lanes are eased where the star field is dense, so no large blot sits on a crowd of albums.
    float rd=1.-abs(2.*fbmG(p*1.5+q.yx*2.8+vec2(40.,13.),1.5,5,5)-1.);
    float rd2=1.-abs(2.*fbmG(p*3.1+q*2.2+vec2(71.,29.),3.1,5,5)-1.);
    float gate=sm(.54,.7,fbmG(p*.8+vec2(90.,55.),.8,3,3));
    float dense=${f(L.DSOFT)}*sm(.55,1.5,dB);
    float lane=min(1.,sm(.9+.05*dense,.96+.032*dense,rd)*gate+sm(.93+.02*dense,.975+.012*dense,rd2)*${f(L.DFINE)}*gate)*sm(.3,.75,Lm);
    float A=1.-${f(L.DUST)}*lane;
    // cream cores on the densest spots, a warm lift on the brightest gas, then the exponential tone map
    const vec3 WARM=vec3(1.,.92,.78);
    float core=pow(dF,1.6)*${f(L.CORE)}*sm(.3,1.,dB), hi=pow(max(0.,Lm-.55),2.)*${f(L.HI)};
    vec3 col=1.-exp(-${f(L.EX)}*(c*Lm*.95+(core+hi)*WARM));
    o=u_bake>.5?vec4(col,A):vec4(finish(col,A,v_raw),1.);
  }`.replace('void main(){', FINISH + '\n  void main(){');

  // the cheap path: one pre-rendered texture per stop (rgb = toned gas without dust, a = what the dust lets through)
  const FS_BAKED = () => `#version 300 es
  precision highp float;
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_a0, u_b0, u_noise; uniform float u_mix, u_ppr, u_bakePpr, u_half;
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  ${FINISH}
  // beyond the bake there is no gas: the same plain sky the live shader ends in
  vec4 samp(sampler2D t,vec2 uv){ float e=step(.5,max(abs(uv.x-.5),abs(uv.y-.5))); return mix(texture(t,clamp(uv,0.,1.)),vec4(0.,0.,0.,1.),e); }
  void main(){
    vec2 uv=(v_raw+u_half)/(2.*u_half);
    vec4 t=samp(u_a0,uv); if(u_mix>0.) t=mix(t,samp(u_b0,uv),u_mix);
    // past the bake's resolution, world-anchored noise octaves (the ones the bake could not hold) keep the gas textured
    if(u_ppr>u_bakePpr){ vec2 p=vec2(v_raw.x*5.+20.,-v_raw.y*5.+20.)*1.25; float d=0., a=.0778, f=38.;
      for(int i=5;i<9;i++){ float have=sm(1.5,4.,u_bakePpr/(6.25*f)), want=sm(1.5,4.,u_ppr/(6.25*f)); if(want>have) d+=a*(want-have)*(vn(p*f+vec2(17.3,9.1)*float(i))-.5); a*=.6; f*=2.07; }
      t.rgb*=1.+1.6*d; }
    o=vec4(finish(t.rgb,t.a,v_raw),1.);
  }`;

  // offscreen gas -> screen, with the mockup's soft additive glow taken from blurred mip levels
  const FS_BLIT = () => `#version 300 es
  precision highp float;
  in vec2 v_uv; out vec4 o; uniform sampler2D u_tex;
  void main(){ vec3 c=texture(u_tex,v_uv).rgb; vec3 g=textureLod(u_tex,v_uv,3.5).rgb*.6+textureLod(u_tex,v_uv,5.).rgb*.4; o=vec4(c+max(g-vec3(.024,.022,.034),0.)*${f(L.GLOW)},1.); }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a_p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  RMR.glProgram = program;

  function makeTarget(w, h, mips) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  Gas.init = function (cv) {
    canvas = cv;
    gl = RMR.gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    Gas.look = LOOKS[param('look')] ? param('look') : G.LOOK; L = LOOKS[Gas.look];
    Gas.scheme = pickScheme();
    // gasonly=1 (debug, for measurement): hide everything but the gas canvas, skip the stars, and publish the camera
    Gas.debug = /[?&]gasonly=1/.test(location.hash);
    if (Gas.debug) { const st = document.createElement('style'); st.textContent = 'body *{visibility:hidden!important} #gl{visibility:visible!important}'; document.head.appendChild(st); }
    // The grids reach past the data by more than the widest blur's support that still lights anything; the bake covers
    // the data plus a margin by which the gas has already ended (env = 0), so its edge is never seen.
    let ext = 0; for (const stop of RMR.D.stops) { const r = RMR.D.raw[stop]; for (let i = 0; i < r.length; i++) ext = Math.max(ext, Math.abs(r[i])); }
    BAKE_HALF = ext + 0.6; G.RAW_HALF = ext + 0.75; Gas.bakeHalf = BAKE_HALF;
    Gas.bakeSize = Math.min(G.BAKE, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    progGas = program(VS, FS_GAS()); progBaked = program(VS, FS_BAKED()); progBlit = program(VS, FS_BLIT());
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    // the mockup's seeded random table
    let a = 7; const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nt = new Uint8Array(256 * 256); for (let i = 0; i < nt.length; i++) nt[i] = Math.floor(rnd() * 256);
    noiseTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, nt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    for (const stop of RMR.D.stops) fields[stop] = buildFields(stop);
    for (const stop of C.STOPS) if (!fields[stop]) fields[stop] = fields.balanced;
    Gas.ok = true;
    for (const stop of RMR.D.stops) buildLum(stop);
    for (const stop of C.STOPS) if (!lum[stop]) { lum[stop] = lum.balanced; rgb[stop] = rgb.balanced; }
    return true;
  };

  function stopsAt(t) { return t <= 0.5 ? ['sonic', 'balanced', t * 2] : ['balanced', 'mood', (t - 0.5) * 2]; }
  /** The uniforms of finish(), shared by both paths. */
  function setFinish(u, o) {
    gl.uniform1f(u.u_strength, o.strength); gl.uniform1f(u.u_dust, o.dust); gl.uniform1f(u.u_poolAmt, o.poolAmt || 0);
    gl.uniform3f(u.u_pool, o.pool ? o.pool[0] : 0, o.pool ? o.pool[1] : 0, o.pool ? o.pool[2] : 1);
  }

  /** Run the live shader over a raw-space rectangle into the bound framebuffer. */
  function runLive(rect, ppr, t, o) {
    const [sa, sb, mix] = stopsAt(t), u = progGas.u, S = Gas.scheme;
    gl.useProgram(progGas.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 0);
    const A = mix >= 1 ? fields[sb] : fields[sa], B = fields[sb], m = mix >= 1 ? 0 : mix;
    for (let i = 0; i < 5; i++) {
      gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, A[i]); gl.uniform1i(u['u_a' + i], 1 + i);
      gl.activeTexture(gl.TEXTURE6 + i); gl.bindTexture(gl.TEXTURE_2D, B[i]); gl.uniform1i(u['u_b' + i], 6 + i);
    }
    gl.uniform3fv(u.u_hue, new Float32Array(S.hues.flat().map((v) => v / 255))); gl.uniform3f(u.u_neu, S.neutral[0] / 255, S.neutral[1] / 255, S.neutral[2] / 255);
    gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.u_mix, m); gl.uniform1f(u.u_ppr, ppr); gl.uniform1f(u.u_bake, o.bake ? 1 : 0); setFinish(u, o);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** A CPU copy of the gas per stop (rendered once at load, no dust, full strength): label halos and the stars'
   * under-discs read luminance from it, so nothing needs readPixels per frame. */
  function buildLum(stop) {
    const n = G.LUM, t = makeTarget(n, n, false), H = G.RAW_HALF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, n, n);
    runLive([-H, -H, H, H], 1000, RMR.STOP_T[stop], { strength: 1, dust: 0 });
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex);
    const Lm = new Float32Array(n * n); for (let i = 0; i < n * n; i++) Lm[i] = U.luminance([px[4 * i], px[4 * i + 1], px[4 * i + 2]]);
    lum[stop] = Lm; rgb[stop] = px;
  }
  const cellOf = (wx, wy) => { const n = G.LUM, tx = RMR.D.tx, H = G.RAW_HALF, g = (v, c) => U.clamp(Math.round(((v / tx.s + c + H) / (2 * H)) * n - 0.5), 0, n - 1); return g(wy, tx.cy) * n + g(wx, tx.cx); };
  /** Gas colour (sRGB bytes) and luminance (0..1) at a world point of a stop. */
  Gas.rgbAt = function (stop, wx, wy) { const i = 4 * cellOf(wx, wy); return [rgb[stop][i], rgb[stop][i + 1], rgb[stop][i + 2]]; };
  Gas.lumAt = function (stop, wx, wy) { const Lm = lum[stop]; return Lm ? Lm[cellOf(wx, wy)] : 0; };
  /** Brightest gas luminance inside a world-space box at a stop. */
  Gas.lumIn = function (stop, x0, y0, x1, y1) {
    const Lm = lum[stop]; if (!Lm) return 0.3;
    const n = G.LUM, a = cellOf(x0, y0), b = cellOf(x1, y1), xa = Math.min(a % n, b % n), xb = Math.max(a % n, b % n), ya = Math.min((a / n) | 0, (b / n) | 0), yb = Math.max((a / n) | 0, (b / n) | 0);
    let m = 0; for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const v = Lm[y * n + x]; if (v > m) m = v; }
    return m;
  };

  function bake(stop) {
    if (baked[stop]) return baked[stop];
    const real = RMR.D.stops.includes(stop) ? stop : 'balanced';
    if (baked[real]) return (baked[stop] = baked[real]);
    const n = Gas.bakeSize, t = makeTarget(n, n, true), H = BAKE_HALF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, n, n);
    runLive([-H, -H, H, H], n / (2 * H), RMR.STOP_T[real], { strength: 1, dust: 1, bake: true });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.generateMipmap(gl.TEXTURE_2D);
    return (baked[stop] = baked[real] = t.tex);
  }
  function runBaked(rect, ppr, t, o) {
    const [sa, sb, mix] = stopsAt(t), u = progBaked.u, ta = bake(mix >= 1 ? sb : sa), tb = bake(sb);
    if (o.fbo !== undefined) { gl.bindFramebuffer(gl.FRAMEBUFFER, o.fbo); gl.viewport(0, 0, o.w, o.h); }   // bake() rebinds
    gl.useProgram(progBaked.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta); gl.uniform1i(u.u_a0, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb); gl.uniform1i(u.u_b0, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 2);
    gl.uniform1f(u.u_ppr, ppr); gl.uniform1f(u.u_bakePpr, Gas.bakeSize / (2 * BAKE_HALF)); gl.uniform1f(u.u_half, BAKE_HALF);
    gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]); gl.uniform1f(u.u_mix, mix >= 1 ? 0 : mix); setFinish(u, o);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Draw the gas for state `st`: {t, strength, dust, pool:[wx,wy,wr], poolAmt, baked, moving}. */
  Gas.draw = function (st) {
    if (!Gas.ok) return;
    const cam = RMR.cam, view = RMR.view, tx = RMR.D.tx, dpr = canvas.width / view.W;
    // the gas is soft: render it at CSS resolution, and at half that while the view is moving on a slow renderer
    const scale = (1 / dpr) * (st.moving && Gas.slow ? 0.5 : 1);
    const tw = Math.max(2, Math.round(canvas.width * scale)), th = Math.max(2, Math.round(canvas.height * scale));
    if (!target || target.w !== tw || target.h !== th) { if (target) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex); } target = makeTarget(tw, th, true); lastKey = ''; }
    const key = [cam.x, cam.y, cam.ppw, cam.inset, st.t, st.strength, st.dust, st.poolAmt, st.pool && st.pool.join(), st.baked, tw, th].join('|');
    if (key !== lastKey) {
      lastKey = key;
      const t0 = performance.now();
      const a = RMR.Cam.toWorld(0, view.H), b = RMR.Cam.toWorld(view.W, 0);
      const rect = [a[0] / tx.s + tx.cx, a[1] / tx.s + tx.cy, b[0] / tx.s + tx.cx, b[1] / tx.s + tx.cy];
      const o = { strength: st.strength, dust: st.dust, poolAmt: st.poolAmt, pool: st.pool ? [st.pool[0] / tx.s + tx.cx, st.pool[1] / tx.s + tx.cy, st.pool[2] / tx.s] : null, fbo: target.fbo, w: tw, h: th };
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, tw, th);
      if (st.baked) runBaked(rect, cam.ppw * tx.s, st.t, o); else runLive(rect, cam.ppw * tx.s, st.t, o);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, target.tex); gl.generateMipmap(gl.TEXTURE_2D);
      Gas.lastMs = performance.now() - t0; Gas.renders = (Gas.renders || 0) + 1;
    }
    if (Gas.debug) document.documentElement.dataset.gascam = [cam.x, cam.y, cam.ppw, cam.inset, view.W, view.H, view.hdr, tx.cx, tx.cy, tx.s].join(',');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progBlit.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, target.tex); gl.uniform1i(progBlit.u.u_tex, 0);
    gl.uniform4f(progBlit.u.u_rect, 0, 0, 1, 1);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  Gas.invalidate = () => { lastKey = ''; };
  /** A 2D canvas copy of a stop's baked gas (for the phone map strip, which is Canvas 2D). {canvas, half} in raw units. */
  const copies = {};
  Gas.bakedCanvas = function (stop) {
    if (!Gas.ok) return null; if (copies[stop]) return copies[stop];
    const n = 1024, t = makeTarget(n, n, false), H = BAKE_HALF;
    runBaked([-H, -H, H, H], 0, RMR.STOP_T[RMR.D.stops.includes(stop) ? stop : 'balanced'], { strength: 1, dust: 1, fbo: t.fbo, w: n, h: n });
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); lastKey = '';
    const cv = document.createElement('canvas'); cv.width = cv.height = n; const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) img.data.set(px.subarray(4 * n * (n - 1 - y), 4 * n * (n - y)), 4 * n * y);   // GL rows run bottom up
    ctx.putImageData(img, 0, 0);
    return (copies[stop] = { canvas: cv, half: H });
  };
})();
