/* The browser half of the theme build: builds the field textures of each stop and runs the gas shader over any
 * raw rectangle at any size (rgb = toned gas with no sky and no dust, a = what the dust lets through): a coarse
 * probe of the whole square, then the stop's own rectangle twice (the image every visitor gets and the sharper
 * one), and once more at 512 px with sky and grain for the luminance that stars and names read. Loaded after bake-core.js by
 * build-theme.mjs. Ported from docs/design/trifid-theme/prototype/src/gas.js with the `swirl` numbers written in:
 * WARP 3.4, W2 1.6, TEX .3 + 2 b^2, FIL .5, CW .42 and .16, DW .14, DUST .8, DSOFT .7, DFINE .7, EX 1.18, P 2.6,
 * SAT 1.05, FAR 1, CORE .07, HI .25. Not the prototype's: the cap on the brightest gas (GAS.KNEE, GAS.PEAK in
 * bake-core.js), added for the 10,467-album map. */
(function () {
  'use strict';
  const T = globalThis.RMR_THEME, G = T.GAS;
  let gl, prog, vao, noiseTex, bakeHalf = 0, rawHalf = 0, baked = null, bakedW = 0;
  const fields = {};

  const VS = `#version 300 es
  in vec2 a_p; uniform vec4 u_rect; out vec2 v_raw;
  void main(){ vec2 uv=a_p*.5+.5; v_raw=mix(u_rect.xy,u_rect.zw,uv); gl_Position=vec4(a_p,0.,1.); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_noise, u_a0, u_a1, u_a2, u_a3, u_a4;
  uniform float u_ppr, u_bake, u_rawHalf;
  uniform vec3 u_hue[6]; uniform vec3 u_neu;
  const float F=5.;
  const float KNEE=${G.KNEE.toFixed(4)}, PEAK=${G.PEAK.toFixed(4)};
  const vec3 SKY=vec3(.024,.022,.034);
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  // value noise from the 256 px random table; the smoothstep fraction makes LINEAR filtering do the interpolation
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  float fbm4(vec2 p){ float s=0.,a=.5,f=1.; for(int i=0;i<4;i++){ s+=a*vn(p*f+vec2(17.3,9.1)*float(i)); a*=.5; f*=2.03; } return s; }
  // fbm with gain .6 and lacunarity 2.07, normalised to 0..1. An octave only counts once its cells are a few
  // pixels wide, so the bake holds exactly the detail its resolution can carry.
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
  // shares raised to a power, so the leading family takes the hue and neighbours bleed in; weak fits (no family
  // leads) and the neutral share lose colour
  vec3 famCol(vec4 a,vec3 b){
    float w[6]; w[0]=max(a.x,0.); w[1]=max(a.y,0.); w[2]=max(a.z,0.); w[3]=max(a.w,0.); w[4]=max(b.x,0.); w[5]=max(b.y,0.);
    float s=0., t=0., m=0.; float q[6];
    for(int j=0;j<6;j++){ s+=w[j]; }
    if(s<1e-9) return u_neu;
    for(int j=0;j<6;j++){ q[j]=pow(w[j]/s,2.6); t+=q[j]; }
    for(int j=0;j<6;j++) q[j]/=t;
    vec3 c=vec3(0.);
    for(int j=0;j<6;j++){ m=max(m,q[j]); c+=u_hue[j]*q[j]; }
    float neu=max(b.z,0.)/(s+max(b.z,0.)+1e-9), sat=min(1.,(.25+1.05*m)*1.05)*(1.-.7*neu);
    return mix(u_neu,c,sat);
  }
  void main(){
    vec2 p=vec2(v_raw.x*F+20.,-v_raw.y*F+20.);
    // the flow: a slow vector field q; every noise lookup below is displaced along it, which is what makes the swirl
    vec2 q=vec2(fbm4(p+vec2(1.7,9.2))-.47, fbm4(p+vec2(8.3,2.8))-.47);
    vec2 pw=p*1.25+q*3.4;
    // a second, finer vector that lives in the warped space: it marbles the luminance and carries the colour
    vec2 r=vec2(fbmG(pw+vec2(31.,77.),1.25,4,4), fbmG(pw+vec2(63.,12.),1.25,4,4))-.5;
    float b=fbmG(pw+r*1.6,1.25,6,8);
    float tex=.3+2.*pow(clamp(b,0.,1.),2.);
    float fold=1.-abs(2.*fbmG(p*2.7+q*4.2+r*1.5+vec2(31.,77.),2.7,5,7)-1.); fold*=fold; tex*=1.+.5*(fold*fold-.22);
    // fields: the fine density is read where it is (cores stay on their albums); the wider ones through a small warp
    // so the cloud's edge is wisps, not a round blur; the colour weights through the flow, so colours swirl
    vec2 uv=(v_raw+u_rawHalf)/(2.*u_rawHalf), fl=vec2(q.x,-q.y), fr=vec2(r.x,-r.y);
    vec2 uvw=uv+fl*.14/(2.*u_rawHalf), uvc=uv+(fl*.42+fr*.16)/(2.*u_rawHalf);
    vec4 d1=texture(u_a0,uv), d0=texture(u_a0,uvw), w1a=texture(u_a1,uvc), w1b=texture(u_a2,uvc), w2a=texture(u_a3,uvc), w2b=texture(u_a4,uvc); float dV=texture(u_a2,uvw).a;
    float dF=min(2.,d1.r), dB=d0.g, dH=d0.b, dFar=d0.a;
    // lit gas wherever albums are, a thin far field around them, and nothing beyond: env is 0 in empty sky, so the
    // cloud ends in the plain dark sky with no outline
    float near=sm(.02,1.6,dB*.7+dH*.55), env=sm(.02,.55,dFar);
    float lit=near*.84+(.2*sm(.05,1.3,dFar)+(.085*sm(0.,1.1,dV)+.03)*env);
    float Lm=lit*tex;
    // colour from the weights: local where albums are, the wider average further out, neutral in the far field
    float s1=dot(w1a,vec4(1.))+dot(w1b.xyz,vec3(1.)), s2=dot(w2a,vec4(1.))+dot(w2b.xyz,vec3(1.));
    vec3 c=u_neu;
    if(s2>1e-7){ c=famCol(w2a,w2b.xyz); if(s1>1e-7) c=mix(c,famCol(w1a,w1b.xyz),sm(0.,.1,s1)); c=mix(u_neu,c,sm(.02,.45,dFar)); }
    // dust: thin, sharp, dark lanes that only show against bright gas, shaped by the same flow. The broad lanes are
    // eased where the albums are dense, so no large blot sits on a crowd of albums.
    float rd=1.-abs(2.*fbmG(p*1.5+q.yx*2.8+vec2(40.,13.),1.5,5,5)-1.);
    float rd2=1.-abs(2.*fbmG(p*3.1+q*2.2+vec2(71.,29.),3.1,5,5)-1.);
    float gate=sm(.54,.7,fbmG(p*.8+vec2(90.,55.),.8,3,3));
    float dense=.7*sm(.55,1.5,dB);
    float lane=min(1.,sm(.9+.05*dense,.96+.032*dense,rd)*gate+sm(.93+.02*dense,.975+.012*dense,rd2)*.7*gate)*sm(.3,.75,Lm);
    float A=1.-.8*lane;
    // cream cores on the densest spots, a warm lift on the brightest gas, then the exponential tone map
    const vec3 WARM=vec3(1.,.92,.78);
    float core=pow(dF,1.6)*.07*sm(.3,1.,dB), hi=pow(max(0.,Lm-.55),2.)*.25;
    vec3 col=1.-exp(-1.18*(c*Lm*.95+(core+hi)*WARM));
    // the cap (bake-core.js capPeak): the brightest gas is eased under PEAK so stars stay brighter than it; all
    // three channels by the same factor, so cream stays cream. The map scales the light afterwards as if the tone
    // map were the exponential alone (shaders/gas.ts lit), which is exact below the knee and close above it.
    float cm=max(col.r,max(col.g,col.b));
    if(cm>KNEE) col*=(KNEE+(PEAK-KNEE)*(1.-exp(-(cm-KNEE)/(PEAK-KNEE))))/cm;
    if(u_bake>.5){ o=vec4(col,A); return; }
    // the luminance copy: the runtime's finish() at full strength with no dust and no pool, sky and grain included
    col=1.-max(1.-col,vec3(.002));
    float n=(texelFetch(u_noise,ivec2(gl_FragCoord.xy)&255,0).r-.5)*.012;
    o=vec4(SKY+col+n,1.);
  }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a_p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  function floatTexture(data, n) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  const base64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  /** input: { n, positions: { sonic, balanced, mood } flat raw xy, weights: six integers per album }. */
  T.start = function (input) {
    gl = document.getElementById('gl').getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('this browser has no WebGL2');
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (max < G.SHARP) throw new Error('MAX_TEXTURE_SIZE is ' + max + ', the bake needs ' + G.SHARP);
    ({ bakeHalf, rawHalf } = T.halves(input.positions));
    prog = program(VS, FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    noiseTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, T.noiseTable());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    for (const stop of T.STOPS) fields[stop] = T.fieldData(Float32Array.from(input.positions[stop]), input.weights, input.n, rawHalf).map((d) => floatTexture(d, G.GRID));
    // gl.RENDERER is masked ("WebKit WebGL"); the extension names the real one, which the build prints
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { bakeHalf, rawHalf, renderer: String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) };
  };

  /** Run the shader for one stop over a raw rectangle into a w x h target and read it back (rows from the south
   * edge). ppr: px per raw unit the octaves are faded for. */
  function run(stop, rect, ppr, bake, w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    const u = prog.u;
    gl.useProgram(prog.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 0);
    for (let i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, fields[stop][i]); gl.uniform1i(u['u_a' + i], 1 + i); }
    const hues = T.EMBER.hues.concat([T.EMBER.neutral]);
    gl.uniform3fv(u.u_hue, new Float32Array(hues.flat().map((v) => v / 255)));
    gl.uniform3f(u.u_neu, T.EMBER.neutral[0] / 255, T.EMBER.neutral[1] / 255, T.EMBER.neutral[2] / 255);
    gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.u_ppr, ppr); gl.uniform1f(u.u_bake, bake ? 1 : 0); gl.uniform1f(u.u_rawHalf, rawHalf);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4 * w * h); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    return px;
  }

  /** A coarse bake of the whole square, as base64 RGBA: T.gasRect finds the stop's rectangle in it. */
  T.probe = function (stop) {
    const H = bakeHalf, n = G.PROBE;
    return base64(run(stop, [-H, -H, H, H], n / (2 * H), true, n, n));
  };
  /** The luminance copy of a stop as base64 RGBA. */
  T.renderLum = function (stop) {
    const R = rawHalf;
    return base64(run(stop, [-R, -R, R, R], G.LUM_PPR, false, G.LUM, G.LUM));
  };
  /** Bake a stop's rectangle [x0, y0, x1, y1] at w x h px (kept in the page for readRows). */
  T.renderStop = function (stop, rect, w, h) {
    baked = run(stop, rect, w / (rect[2] - rect[0]), true, w, h); bakedW = w;
  };
  /** Rows y0 to y0 + rows of the last bake as base64 RGBA (a whole stop is too large for one message). */
  T.readRows = function (y0, rows) { return base64(baked.subarray(4 * bakedW * y0, 4 * bakedW * (y0 + rows))); };
})();
