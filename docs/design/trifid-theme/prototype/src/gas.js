/* The gas: the mockup's Canvas 2D recipe (mockups/src/trifid.js) as a WebGL2 fragment shader over field
 * textures built on the CPU at load, with the fixes of UX.md section 3:
 *   brightness = album density only (a steep response, so dense cores glow and sparse ground is dim), capped;
 *   noise moves luminance by at most 2x; family hues mixed in OKLab so neighbours bleed into each other;
 *   colour only where albums are (neutral far field); dust only where albums are few; noise anchored in world
 *   space with finer octaves fading in with zoom.
 * The gas is drawn into an offscreen target only when the camera or state changes; stars are drawn over it. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util, G = C.GAS;
  const Gas = (RMR.Gas = { ok: false, lastMs: 0 });
  let gl, canvas, progGas, progBaked, progBlit, vao, noiseTex, target = null, lastKey = '';
  const fields = {}, baked = {}, lum = {}, dens = {}, rgb = {}; let BAKE_HALF = 1.6;

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
  /** Density at several blurs and six family-weight grids for one stop, normalised by percentiles taken at the
   * album positions (so the rule is the same at 4,000 or 10,000 points), packed into five RGBA float textures. */
  function buildFields(stop) {
    const D = RMR.D, n = G.GRID, N = D.n, raw = D.raw[stop], cell = (2 * G.RAW_HALF) / n, B = G.BLUR;
    const g = new Float32Array(n * n), w6 = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(n * n));
    const gxs = new Float32Array(N), gys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const gx = (raw[2 * i] + G.RAW_HALF) / cell - 0.5, gy = (raw[2 * i + 1] + G.RAW_HALF) / cell - 0.5; gxs[i] = gx; gys[i] = gy;
      const xi = Math.floor(gx), yi = Math.floor(gy); if (xi < 0 || yi < 0 || xi >= n - 1 || yi >= n - 1) continue;
      const fx = gx - xi, fy = gy - yi, o = yi * n + xi, k = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], oo = [o, o + 1, o + n, o + n + 1];
      for (let c = 0; c < 4; c++) { g[oo[c]] += k[c]; for (let j = 0; j < 6; j++) w6[j][oo[c]] += k[c] * D.w[6 * i + j]; }
    }
    const mk = (src, sigma) => blur(Float32Array.from(src), n, n, sigma / cell);
    const fine = mk(g, B.fine), big = mk(g, B.big), huge = mk(g, B.huge), far = mk(g, B.far), vfar = mk(g, B.vfar);
    dens[stop] = { big, n };
    const wide = w6.map((q) => mk(q, B.wide)); w6.forEach((q) => blur(q, n, n, B.col / cell));
    const pct = (d, q) => { const v = []; for (let i = 0; i < N; i += 2) v.push(at(d, n, gxs[i], gys[i])); v.sort((a, b) => a - b); return v[Math.floor(v.length * q)] || 1e-6; };
    const nb = pct(big, 0.6), nh = pct(huge, 0.6), nf = pct(fine, 0.85), nfar = pct(far, 0.5), nvf = pct(vfar, 0.5);
    const T = [0, 1, 2, 3, 4].map(() => new Float32Array(4 * n * n));
    for (let i = 0; i < n * n; i++) {
      const o = 4 * i;
      T[0][o] = fine[i] / nf; T[0][o + 1] = big[i] / nb; T[0][o + 2] = huge[i] / nh; T[0][o + 3] = far[i] / nfar;
      for (let j = 0; j < 4; j++) { T[1][o + j] = w6[j][i] / nb; T[3][o + j] = wide[j][i] / nh; }
      T[2][o] = w6[4][i] / nb; T[2][o + 1] = w6[5][i] / nb; T[2][o + 2] = vfar[i] / nvf;
      T[4][o] = wide[4][i] / nh; T[4][o + 1] = wide[5][i] / nh;
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

  // OKLab (Ottosson): the family hues are mixed there, so a blend of two families keeps an even lightness and loses
  // chroma only as much as the two hues oppose each other.
  const oklab = (c) => {
    const [r, g, b] = c.map((v) => Math.pow(v / 255, 2.2));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q];
  };
  const v3 = (c) => `vec3(${c.map((v) => v.toFixed(5))})`;

  const FS_GAS = () => `#version 300 es
  precision highp float;
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_noise, u_a0, u_a1, u_a2, u_a3, u_a4, u_b0, u_b1, u_b2, u_b3, u_b4;
  uniform float u_mix, u_ppr, u_strength, u_dust, u_poolAmt, u_isoAmt, u_bake;
  uniform vec3 u_pool; uniform int u_iso;
  const float HALF=${G.RAW_HALF.toFixed(3)}, F=5., CAP=${G.LUM_CAP.toFixed(3)}, PRIOR=.22, FLOORY=${G.FLOOR_Y.toFixed(5)};
  const float LUMK[5]=float[5](${C.FAM_LUM.map((v) => v.toFixed(2))});
  const vec3 NEU=${v3(oklab(C.NEU))};
  const vec3 FAM[5]=vec3[5](${C.FAM.map((c) => v3(oklab(c))).join(',')});
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  // value noise from a 256 px random texture; the smoothstep fraction makes LINEAR filtering do the interpolation
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  float fbm4(vec2 p){ float s=0.,a=.5,f=1.; for(int i=0;i<4;i++){ s+=a*vn(p*f+vec2(17.3,9.1)*float(i)); a*=.5; f*=2.03; } return s; }
  // The mockup's fbmG (gain .6, lacunarity 2.07, normalised to 0..1). An octave only counts once its cells are a few
  // pixels wide: no shimmer when zoomed out, and finer octaves (beyond the mockup's 'base') fade in when zoomed in.
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
  // Colour: the five family hues mixed in OKLab by the (sharpened) shares of the albums near, so neighbouring
  // families bleed into each other over the width of the colour blur. Returns OKLab.
  //   - weak fits (no family leads) and the neutral share lose chroma, as before;
  //   - rose against blue would pass through a mauve that reads as the urban violet. That pair alone is contested:
  //     the stronger of the two takes the hue, and where they tie the gas goes dusky (less chroma, a little deeper).
  // lumK: a per-family luminance factor that keeps the five apart for colour-blind readers.
  vec3 famCol(vec4 a,vec2 b,out float share,out float lumK){
    float w[5]; w[0]=max(a.x,0.); w[1]=max(a.y,0.); w[2]=max(a.z,0.); w[3]=max(a.w,0.); w[4]=max(b.x,0.);
    float s=w[0]+w[1]+w[2]+w[3]+w[4]; share=0.; lumK=1.;
    if(s<1e-9) return NEU;
    float q[5]; float t=0., f1=0.;
    for(int j=0;j<5;j++){ float f=w[j]/s; f1=max(f1,f); if(j==u_iso) share=f; q[j]=pow(f,${G.MIX_POW.toFixed(2)}); t+=q[j]; }
    for(int j=0;j<5;j++) q[j]/=t;
    float rb=q[0]+q[3], dusk=0.;
    if(rb>1e-5){ float sh=sm(.3,.7,q[0]/rb); q[0]=rb*sh; q[3]=rb*(1.-sh); dusk=4.*sh*(1.-sh)*rb; }
    vec3 lab=vec3(0.); float lk=0., pur=0.;
    for(int j=0;j<5;j++){ lab+=FAM[j]*q[j]; lk+=LUMK[j]*q[j]; pur+=q[j]*q[j]; }
    float neu=b.y/(s+b.y+1e-9), sat=sm(.2,.5,f1)*(1.-.7*neu)*min(1.,1.3*(s+b.y)/(s+b.y+PRIOR));
    sat*=mix(.75,1.,sm(.34,.62,pur))*(1.-.7*dusk);
    lumK=mix(${G.NEU_LUM.toFixed(2)},lk*(1.-.22*dusk),sat);
    return vec3(mix(NEU.x,lab.x,sat), lab.yz*sat*${G.CHROMA.toFixed(2)}+NEU.yz*(1.-sat));
  }
  vec3 lab2lin(vec3 c){
    float l=c.x+.3963377774*c.y+.2158037573*c.z, m=c.x-.1055613458*c.y-.0638541728*c.z, s=c.x-.0894841775*c.y-1.291485548*c.z;
    l=l*l*l; m=m*m*m; s=s*s*s;
    return max(vec3(4.0767416621*l-3.3077115913*m+.2309699292*s, -1.2684380046*l+2.6097574011*m-.3413193965*s, -.0041960863*l-.7034186147*m+1.707614701*s), 0.);
  }
  void main(){
    vec2 p=vec2(v_raw.x*F+20.,-v_raw.y*F+20.);
    vec2 q=vec2(fbm4(p+vec2(1.7,9.2))-.47, fbm4(p+vec2(8.3,2.8))-.47);
    // texture: broad veils (warped fbm), folds (ridged, medium) and fine filaments (ridged, fine); 0..1 each
    float b=fbmG(p*1.25+q*2.8,1.25,6,8);
    float fold=1.-abs(2.*fbmG(p*2.7+q*4.2+vec2(31.,77.),2.7,5,7)-1.);
    float rdg=1.-abs(2.*fbmG(p*6.+q*5.+vec2(13.,57.),6.,4,6)-1.);
    float f2=fold*fold, r2=rdg*rdg;
    float tx=clamp(.24*sm(.42,.58,b)+.76*max(f2*f2,.9*r2*r2),0.,1.);
    float tex=mix(${G.TEX[0].toFixed(2)},${G.TEX[1].toFixed(2)},tx);   // noise moves luminance by this range and no more
    // The medium and wide densities are read through a small warp (a broad swirl plus a finer one that follows the
    // veils; both well under the medium blur), so the edge of a cluster comes out as wisps rather than a round blur.
    // The fine density and the colour fields are read unwarped: cores stay on their stars.
    vec2 uv=(v_raw+HALF)/(2.*HALF), uvw=uv+(vec2(q.x,-q.y)*${G.WARP.toFixed(4)}+vec2(b-.5,.75-fold)*${G.WARP2.toFixed(4)})/(2.*HALF);
    vec4 d0=texture(u_a0,uvw), w1a=texture(u_a1,uv), t2=texture(u_a2,uv), w2a=texture(u_a3,uv), t4=texture(u_a4,uv);
    if(u_mix>0.){ d0=mix(d0,texture(u_b0,uvw),u_mix); w1a=mix(w1a,texture(u_b1,uv),u_mix); t2=mix(t2,texture(u_b2,uv),u_mix); w2a=mix(w2a,texture(u_b3,uv),u_mix); t4=mix(t4,texture(u_b4,uv),u_mix); }
    vec4 d1=texture(u_a0,uv); if(u_mix>0.) d1=mix(d1,texture(u_b0,uv),u_mix);
    float dF=min(2.4,d1.r), dB=d0.g, dH=d0.b, dFar=d1.a;
    // Brightness is album density and nothing else: a steep response, because the layout is even (the densest
    // ground holds only about four times the albums of the sparsest), with the medium blur as the body, the fine
    // blur as the cores and the wide blur as a soft envelope.
    float d=.58*dB+.32*dF+.10*dH;
    float near=1.-exp(-1.3*d);
    float E=.10*near+pow(d/${G.D_REF.toFixed(2)},${G.D_POW.toFixed(2)});
    // Far field: a constant floor that never ends (the same value the baked path returns beyond its texture), plus
    // faint smoke that depends only on distance from albums. No shape of its own, so no boundary.
    float smoke=${G.SMOKE.toFixed(4)}*sm(.08,1.3,dFar)*(.5+b)*(1.-near);
    // colour: the local blend where albums are, bleeding into the wider average, and none where there are no albums
    float s1=w1a.x+w1a.y+w1a.z+w1a.w+t2.x+t2.y, s2=w2a.x+w2a.y+w2a.z+w2a.w+t4.x+t4.y, iso=0., lumK=1.;
    vec3 c=NEU;
    if(s2>1e-6){
      // share of the wide average in the blend: all of it where there are no albums, most of it where there are
      // only a few (a handful of albums should not paint a fringe of their own), BLEED of it in populated ground
      float bl=${G.BLEED.toFixed(2)}+(1.-${G.BLEED.toFixed(2)})*(1.-sm(0.,.6,s1));
      c=famCol(mix(w1a,w2a,bl),mix(t2.xy,t4.xy,bl),iso,lumK);
      float g=sm(.02,.4,dB*.65+dH*.4); c=mix(NEU,c,g);
    }
    // dust: dark lanes in the true gaps, only against lit gas and only where albums are few (dark means few albums)
    float rd=1.-abs(2.*fbmG(p*1.5+q.yx*2.8+vec2(40.,13.),1.5,5,7)-1.);
    float rd2=1.-abs(2.*fbmG(p*3.1+q*2.2+vec2(71.,29.),3.1,5,7)-1.);
    float gate=sm(.4,.6,fbmG(p*.8+vec2(90.,55.),.8,3,3));
    float lane=min(1.,sm(.82,.94,rd)*gate+sm(.88,.96,rd2)*.5*gate)*sm(.05,.22,near);
    lane*=1.-sm(.05,.3,dF);
    float A=1.-.75*lane;
    // legend: one family isolated, the rest desaturated and dimmed
    float dim=1.;
    if(u_isoAmt>0.&&u_iso>=0){
      float on=sm(.25,.5,iso), keep=mix(1.,on,u_isoAmt);
      c=mix(c,mix(vec3(c.x,NEU.yz),vec3(FAM[u_iso].x,FAM[u_iso].yz*${G.CHROMA.toFixed(2)}),on),u_isoAmt);   // its own hue where it is, grey elsewhere
      dim=mix(.4,1.,keep); lumK=mix(1.,mix(1.,LUMK[u_iso],on),u_isoAmt);
    }
    // zoom band strength and the focus pool (album open: 60% everywhere, 25% and half saturation around the group)
    float k=u_strength;
    if(u_poolAmt>0.){ vec2 dd=(v_raw-u_pool.xy)/u_pool.z; float e=exp(-dot(dd,dd)*.5); k*=mix(1.,mix(.6,.25,e),u_poolAmt); c.yz*=1.-.5*e*u_poolAmt; }
    // Tone: density sets luminance through a shoulder. The hue keeps its chroma through the mid tones; only the
    // brightest cores lift toward a warm white, as an over-exposed emission core does.
    float I=E*dim*k, T=1.-exp(-${G.EXPO.toFixed(2)}*I);
    float Y=min(${G.LUM_MAX.toFixed(2)},FLOORY+smoke*k+CAP*T*tex*lumK);
    vec3 cl=lab2lin(c); vec3 lin=cl*(Y/max(dot(cl,vec3(.2126,.7152,.0722)),1e-4));
    float wh=${G.WHITE.toFixed(2)}*sm(.45,.95,T)*(.6+.4*tx); vec3 hot=vec3(1.,.93,.82); lin=mix(lin,hot*(Y/dot(hot,vec3(.2126,.7152,.0722))),wh);
    float mx=max(lin.r,max(lin.g,lin.b)); if(mx>1.) lin=mix(lin,vec3(Y),(mx-1.)/(mx-Y));
    vec3 rgb=pow(lin,vec3(1./2.2));
    if(u_bake<.5) rgb*=mix(1.,A,u_dust);   // dust after the tone curve, exactly as the baked path applies it
    float n=(texelFetch(u_noise,ivec2(gl_FragCoord.xy)&255,0).r-.5)*.012;
    o=vec4(rgb+vec3(.02,.018,.03)+n, u_bake>.5?A:1.);
  }`;

  // the cheap path: one pre-rendered texture per stop (rgb = gas without dust, a = dust attenuation)
  const FS_BAKED = () => `#version 300 es
  precision highp float;
  const vec3 FLOORC=vec3(${floorRGB().map((v) => v.toFixed(4))});
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_a0, u_b0, u_noise; uniform float u_mix, u_strength, u_dust, u_poolAmt, u_ppr, u_bakePpr; uniform vec3 u_pool;
  uniform float u_half;
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  // beyond the bake: the same constant floor the live shader ends in, with the same grain
  vec4 samp(sampler2D t,vec2 uv){ float e=step(.5,max(abs(uv.x-.5),abs(uv.y-.5))); float n=(texelFetch(u_noise,ivec2(gl_FragCoord.xy)&255,0).r-.5)*.012; return mix(texture(t,clamp(uv,0.,1.)),vec4(FLOORC+n,1.),e); }
  void main(){
    vec2 uv=(v_raw+u_half)/(2.*u_half);
    vec4 t=samp(u_a0,uv); if(u_mix>0.) t=mix(t,samp(u_b0,uv),u_mix);
    // past the bake's resolution, world-anchored noise octaves (the ones the bake could not hold) keep the gas textured
    if(u_ppr>u_bakePpr){ vec2 p=vec2(v_raw.x*5.+20.,-v_raw.y*5.+20.)*1.25; float d=0., a=.0778, f=38.;
      for(int i=5;i<9;i++){ float have=sm(1.5,4.,u_bakePpr/(6.25*f)), want=sm(1.5,4.,u_ppr/(6.25*f)); if(want>have) d+=a*(want-have)*(vn(p*f+vec2(17.3,9.1)*float(i))-.5); a*=.6; f*=2.07; }
      t.rgb*=1.+1.6*d; }
    vec3 c=t.rgb*mix(1.,t.a,u_dust); float k=u_strength;
    if(u_poolAmt>0.){ vec2 dd=(v_raw-u_pool.xy)/u_pool.z; float e=exp(-dot(dd,dd)*.5); k*=mix(1.,mix(.6,.25,e),u_poolAmt); float gr=(c.r+c.g+c.b)/3.; c=mix(c,vec3(gr),.5*e*u_poolAmt); }
    // strength: the live shader scales the density response before its shoulder, so dim gas falls in proportion
    // (sRGB exponent 1/2.2) and bright cores fall less; the bake follows that with an exponent that eases with brightness
    float m=max(c.r,max(c.g,c.b));
    o=vec4(FLOORC+(c-FLOORC)*pow(k,mix(.52,.31,sm(.25,.85,m))),1.);
  }`;

  // offscreen gas -> screen, with the mockup's soft glow taken from a blurred mip level
  const FS_BLIT = `#version 300 es
  precision highp float;
  in vec2 v_uv; out vec4 o; uniform sampler2D u_tex;
  void main(){ vec3 c=texture(u_tex,v_uv).rgb; vec3 g=textureLod(u_tex,v_uv,3.5).rgb*.6+textureLod(u_tex,v_uv,5.).rgb*.4; o=vec4(c+g*.14,1.); }`;

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
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
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
    // gasonly=1 (debug, for measurement): hide everything but the gas canvas, skip the stars, and publish the camera
    Gas.debug = /[?&]gasonly=1/.test(location.hash);
    if (Gas.debug) { const st = document.createElement('style'); st.textContent = 'body *{visibility:hidden!important} #gl{visibility:visible!important}'; document.head.appendChild(st); }
    // grids and the bake cover the data plus the reach of the smoke, whatever the layout's extent
    let ext = 0; for (const stop of RMR.D.stops) { const r = RMR.D.raw[stop]; for (let i = 0; i < r.length; i++) ext = Math.max(ext, Math.abs(r[i])); }
    BAKE_HALF = ext + 0.6; G.RAW_HALF = ext + 0.75; Gas.bakeHalf = BAKE_HALF;
    Gas.bakeSize = Math.min(G.BAKE, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    progGas = program(VS, FS_GAS()); progBaked = program(VS, FS_BAKED()); progBlit = program(VS, FS_BLIT);
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
    for (const stop of C.STOPS) if (!lum[stop]) lum[stop] = lum.balanced;
    return true;
  };

  /** The far-sky colour both paths end in: the tone curve at the constant floor, in neutral, plus the base. */
  function floorRGB() {
    const Y = G.FLOOR_Y, lin = C.NEU.map((v) => Math.pow(v / 255, 2.2)), yn = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return lin.map((v, k) => Math.pow(v * Y / yn, 1 / 2.2) + [0.02, 0.018, 0.03][k]);
  }
  function stopsAt(t) { return t <= 0.5 ? ['sonic', 'balanced', t * 2] : ['balanced', 'mood', (t - 0.5) * 2]; }

  /** Run the live shader over a raw-space rectangle into the bound framebuffer. */
  function runLive(rect, ppr, t, o) {
    const [sa, sb, mix] = stopsAt(t), u = progGas.u;
    gl.useProgram(progGas.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 0);
    const A = mix >= 1 ? fields[sb] : fields[sa], B = fields[sb], m = mix >= 1 ? 0 : mix;
    for (let i = 0; i < 5; i++) {
      gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, A[i]); gl.uniform1i(u['u_a' + i], 1 + i);
      gl.activeTexture(gl.TEXTURE6 + i); gl.bindTexture(gl.TEXTURE_2D, B[i]); gl.uniform1i(u['u_b' + i], 6 + i);
    }
    gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.u_mix, m); gl.uniform1f(u.u_ppr, ppr); gl.uniform1f(u.u_strength, o.strength); gl.uniform1f(u.u_dust, o.dust);
    gl.uniform1f(u.u_poolAmt, o.poolAmt || 0); gl.uniform3f(u.u_pool, o.pool ? o.pool[0] : 0, o.pool ? o.pool[1] : 0, o.pool ? o.pool[2] : 1);
    gl.uniform1i(u.u_iso, o.iso == null ? -1 : o.iso); gl.uniform1f(u.u_isoAmt, o.isoAmt || 0); gl.uniform1f(u.u_bake, o.bake ? 1 : 0);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** A CPU copy of the gas luminance per stop (rendered once at load), so label scrims need no readPixels per frame. */
  function buildLum(stop) {
    const n = G.LUM, t = makeTarget(n, n, false), H = G.RAW_HALF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, n, n);
    runLive([-H, -H, H, H], 1000, RMR.STOP_T[stop], { strength: 1, dust: 0 });
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex);
    const L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = U.luminance([px[4 * i], px[4 * i + 1], px[4 * i + 2]]);
    lum[stop] = L; rgb[stop] = px;
  }
  /** Spearman rank correlation of gas luminance (dust on) with album density (sigma 0.05) over a world rectangle. */
  Gas.densityRho = function (stop, x0, y0, x1, y1) {
    const n = G.LUM, t = makeTarget(n, n, false), tx = RMR.D.tx, r = [x0 / tx.s + tx.cx, y0 / tx.s + tx.cy, x1 / tx.s + tx.cx, y1 / tx.s + tx.cy];
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, n, n);
    runLive(r, n / (r[2] - r[0]), RMR.STOP_T[stop], { strength: 1, dust: 1 });
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); lastKey = '';
    const d = dens[stop], cell = (2 * G.RAW_HALF) / d.n, a = [], b = [];
    for (let y = 0; y < n; y += 3) for (let x = 0; x < n; x += 3) {
      const rx = r[0] + (x + 0.5) / n * (r[2] - r[0]), ry = r[1] + (y + 0.5) / n * (r[3] - r[1]), i = 4 * (y * n + x);
      a.push(U.luminance([px[i], px[i + 1], px[i + 2]])); b.push(at(d.big, d.n, (rx + G.RAW_HALF) / cell - 0.5, (ry + G.RAW_HALF) / cell - 0.5));
    }
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r2 = new Float64Array(v.length); o.forEach((p, k) => (r2[p[1]] = k)); return r2; };
    const ra = rank(a), rb = rank(b), m = (a.length - 1) / 2; let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) { sab += (ra[i] - m) * (rb[i] - m); saa += (ra[i] - m) ** 2; sbb += (rb[i] - m) ** 2; }
    return sab / Math.sqrt(saa * sbb);
  };
  /** Gas colour (sRGB bytes, no dust, full strength) at a world point, and the brightest luminance of a stop. */
  Gas.rgbAt = function (stop, wx, wy) { const n = G.LUM, tx = RMR.D.tx, H = G.RAW_HALF, f = (v, c) => U.clamp(Math.round(((v / tx.s + c + H) / (2 * H)) * n - 0.5), 0, n - 1), i = 4 * (f(wy, tx.cy) * n + f(wx, tx.cx)); return [rgb[stop][i], rgb[stop][i + 1], rgb[stop][i + 2]]; };
  Gas.lumMax = (stop) => lum[stop].reduce((m, v) => (v > m ? v : m), 0);
  /** Gas luminance (0..1, no dust, full strength) at a world point of a stop; the stars use it for their under-disc. */
  Gas.lumAt = function (stop, wx, wy) { const L = lum[stop]; if (!L) return 0; const n = G.LUM, tx = RMR.D.tx, H = G.RAW_HALF, f = (v, c) => U.clamp(Math.round(((v / tx.s + c + H) / (2 * H)) * n - 0.5), 0, n - 1); return L[f(wy, tx.cy) * n + f(wx, tx.cx)]; };
  /** Brightest gas luminance (relative, 0..1) inside a world-space box at a stop, at full strength. */
  Gas.lumIn = function (stop, x0, y0, x1, y1) {
    const L = lum[stop]; if (!L) return 0.3;
    const n = G.LUM, tx = RMR.D.tx, H = G.RAW_HALF, f = (v, c) => Math.round(((v / tx.s + c + H) / (2 * H)) * n - 0.5);
    const a = U.clamp(f(x0, tx.cx), 0, n - 1), b = U.clamp(f(x1, tx.cx), 0, n - 1), c = U.clamp(f(y0, tx.cy), 0, n - 1), d = U.clamp(f(y1, tx.cy), 0, n - 1);
    let m = 0; for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { const v = L[y * n + x]; if (v > m) m = v; }
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

  /** Draw the gas for state `st`: {t, strength, dust, pool:[wx,wy,wr], poolAmt, iso, isoAmt, baked, moving}. */
  Gas.draw = function (st) {
    if (!Gas.ok) return;
    const cam = RMR.cam, view = RMR.view, tx = RMR.D.tx, dpr = canvas.width / view.W;
    // the gas is soft: render it at CSS resolution, and at half that while the view is moving on a slow renderer
    const scale = (1 / dpr) * (st.moving && Gas.slow ? 0.5 : 1);
    const tw = Math.max(2, Math.round(canvas.width * scale)), th = Math.max(2, Math.round(canvas.height * scale));
    if (!target || target.w !== tw || target.h !== th) { if (target) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex); } target = makeTarget(tw, th, true); lastKey = ''; }
    // an isolated family needs the live shader, so the baked path steps aside while the legend is in use
    const useBaked = st.baked && !(st.isoAmt > 0);
    const key = [cam.x, cam.y, cam.ppw, cam.inset, st.t, st.strength, st.dust, st.poolAmt, st.pool && st.pool.join(), st.iso, st.isoAmt, useBaked, tw, th].join('|');
    if (key !== lastKey) {
      lastKey = key;
      const t0 = performance.now();
      const a = RMR.Cam.toWorld(0, view.H), b = RMR.Cam.toWorld(view.W, 0);
      const rect = [a[0] / tx.s + tx.cx, a[1] / tx.s + tx.cy, b[0] / tx.s + tx.cx, b[1] / tx.s + tx.cy];
      const pool = st.pool ? [st.pool[0] / tx.s + tx.cx, st.pool[1] / tx.s + tx.cy, st.pool[2] / tx.s] : null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, tw, th);
      if (useBaked) {
        const [sa, sb, mix] = stopsAt(st.t), u = progBaked.u, ta = bake(mix >= 1 ? sb : sa), tb = bake(sb);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, tw, th);
        gl.useProgram(progBaked.p); gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta); gl.uniform1i(u.u_a0, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb); gl.uniform1i(u.u_b0, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 2);
        gl.uniform1f(u.u_ppr, cam.ppw * tx.s); gl.uniform1f(u.u_bakePpr, Gas.bakeSize / (2 * BAKE_HALF)); gl.uniform1f(u.u_half, BAKE_HALF);
        gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]); gl.uniform1f(u.u_mix, mix >= 1 ? 0 : mix);
        gl.uniform1f(u.u_strength, st.strength); gl.uniform1f(u.u_dust, st.dust); gl.uniform1f(u.u_poolAmt, st.poolAmt || 0);
        gl.uniform3f(u.u_pool, pool ? pool[0] : 0, pool ? pool[1] : 0, pool ? pool[2] : 1);
        gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        runLive(rect, cam.ppw * tx.s, st.t, { strength: st.strength, dust: st.dust, pool, poolAmt: st.poolAmt, iso: st.iso, isoAmt: st.isoAmt });
      }
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
    const n = 1024, t = makeTarget(n, n, false), tex = bake(stop), u = progBaked.u, H = BAKE_HALF;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, n, n); gl.useProgram(progBaked.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.u_a0, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.u_b0, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 2);
    gl.uniform4f(u.u_rect, -H, -H, H, H); gl.uniform1f(u.u_mix, 0); gl.uniform1f(u.u_strength, 1); gl.uniform1f(u.u_dust, 1); gl.uniform1f(u.u_poolAmt, 0); gl.uniform1f(u.u_ppr, 0); gl.uniform1f(u.u_bakePpr, 1); gl.uniform1f(u.u_half, H);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); lastKey = '';
    const cv = document.createElement('canvas'); cv.width = cv.height = n; const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) img.data.set(px.subarray(4 * n * (n - 1 - y), 4 * n * (n - y)), 4 * n * y);   // GL rows run bottom up
    ctx.putImageData(img, 0, 0);
    return (copies[stop] = { canvas: cv, half: H });
  };
})();
