/* Stars: one additive gl.POINTS draw. Each album carries its three stop positions, so the slider morph is a
 * uniform. Four magnitude classes, dealt at random on each load (src/data.js). A star is a crisp core with a bloom that falls off smoothly to nothing (wide on
 * the first two classes), so the brightest read as bright stars. No spikes (they read as ornament).
 * Under each star a soft dark disc keeps it legible on bright gas; it is drawn only as strongly as the gas behind
 * the star needs (looked up once at load, per stop), so on dim gas and dark sky there is no disc and no ring. */
(function () {
  'use strict';
  const RMR = window.RMR, C = RMR.cfg, U = RMR.util;
  const Stars = (RMR.Stars = {});
  let gl, prog, vao, n = 0;
  const LMAX = 0.6;   // the gas luminance behind a star is stored in a byte, 0..LMAX

  const VS = `#version 300 es
  in vec2 a_p0; in vec2 a_p1; in vec2 a_p2; in vec4 a_col; in vec3 a_bg;
  uniform vec4 u_cam;   // x, y, ppw, slider t
  uniform vec4 u_view;  // W, H, centre x, centre y of the visible map (CSS px)
  uniform float u_dpr, u_sizeK, u_alpha, u_dark, u_halo;
  out vec3 v_col; out vec4 v_geom; out float v_alpha;
  const float RAD[4]=float[4](${C.STAR_RADIUS.map((v) => v.toFixed(2))});
  const float ALP[4]=float[4](${C.STAR_ALPHA.map((v) => v.toFixed(2))});
  const float GLOW[4]=float[4](${C.STAR_GLOW.map((v) => v.toFixed(2))});
  void main(){
    float t=u_cam.w; vec2 p=t<=.5?mix(a_p0,a_p1,t*2.):mix(a_p1,a_p2,(t-.5)*2.);
    vec2 s=vec2(u_view.z+(p.x-u_cam.x)*u_cam.z, u_view.w-(p.y-u_cam.y)*u_cam.z);
    gl_Position=vec4(s.x/u_view.x*2.-1., 1.-s.y/u_view.y*2., 0., 1.);
    int cls=int(a_col.a*3.+.5);
    float r=RAD[cls]*u_sizeK, dim=min(1.,r/.8); r=max(r,.8);
    // reach of the sprite: the under-disc, or the bloom (wide only on the first two classes, and only when zoomed in enough)
    float wide=cls==0?6.:cls==1?4.4:2.6;
    float ext=u_dark>.5?r*3.+1.:r*mix(2.6,wide,u_halo)+1.;
    gl_PointSize=2.*(ext+1.)*u_dpr;
    float bg=(t<=.5?mix(a_bg.x,a_bg.y,t*2.):mix(a_bg.y,a_bg.z,(t-.5)*2.))*${LMAX.toFixed(2)};
    // just enough disc that the gas beside the star is no brighter than STAR_UNDER[0] (white on that is 3:1)
    float under=clamp(1.-${C.STAR_UNDER[0].toFixed(2)}/max(bg,.001),0.,${C.STAR_UNDER[1].toFixed(2)});
    v_geom=vec4(r*u_dpr, ext*u_dpr, u_dark>.5?under:GLOW[cls]*(cls<2?mix(.3,1.,u_halo):1.), cls<2?u_halo:0.);
    v_col=a_col.rgb;
    v_alpha=ALP[cls]*u_alpha*dim;
  }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 v_col; in vec4 v_geom; in float v_alpha; out vec4 o; uniform float u_dark;
  void main(){
    float size=2.*(v_geom.y+1.), d=length(gl_PointCoord-.5)*size, r=v_geom.x, win=clamp(1.-d/v_geom.y,0.,1.);
    // pass 1: the dark under-disc, darkest at the star's rim and gone by three radii, with no edge of its own
    if(u_dark>.5){ float f=clamp(1.-(d-r*.8)/(v_geom.y-r*.8),0.,1.); o=vec4(0.,0.,0.,v_geom.z*min(1.,v_alpha*1.4)*f*f); return; }
    // pass 2: core plus bloom. The bloom is a tight Gaussian (every class) and a wide skirt (first two classes),
    // both windowed to zero at the sprite's edge.
    float core=smoothstep(r+.6,r-.6,d), x=d/r;
    float bloom=v_geom.z*(.5*exp(-x*x*.3)+.2*v_geom.w*exp(-x*x*.045))*win*win;
    o=vec4(v_col*(core+bloom*(1.-core))*v_alpha,1.);
  }`;


  Stars.init = function () {
    gl = RMR.gl; if (!gl) return;
    const D = RMR.D; n = D.n;
    const locs = ['a_p0', 'a_p1', 'a_p2', 'a_col', 'a_bg'];
    let vs = VS;
    locs.forEach((name, k) => { vs = vs.replace(new RegExp('in (vec[234]|float) ' + name + ';'), (m) => `layout(location=${k}) ` + m); });
    prog = RMR.glProgram(vs, FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const attr = (loc, data, size, type, norm) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, !!norm, 0, 0); return b; };
    attr(0, D.pos.sonic, 2, gl.FLOAT); attr(1, D.pos.balanced, 2, gl.FLOAT); attr(2, D.pos.mood, 2, gl.FLOAT);
    // near-white with 25% of the hue of the album's leading colour channel (in the scheme the gas uses); magnitude class in alpha
    const col = new Uint8Array(4 * n), white = [255, 250, 244], sc = RMR.Gas.scheme, lead = sc ? sc.lead : D.lead, hues = sc ? sc.hues : C.FAM;
    for (let i = 0; i < n; i++) {
      const f = lead[i] >= 0 ? hues[lead[i]] : white;
      for (let k = 0; k < 3; k++) col[4 * i + k] = Math.round(white[k] * 0.75 + f[k] * 0.25);
      col[4 * i + 3] = Math.round((D.cls[i] / 3) * 255);
    }
    attr(3, col, 4, gl.UNSIGNED_BYTE, true); Stars.col = col; Stars.ok = true;
    // gas luminance behind each star at each stop (decides how much under-disc it gets)
    const bg = new Uint8Array(3 * n), Gas = RMR.Gas;
    if (Gas.ok) ['sonic', 'balanced', 'mood'].forEach((stop, k) => { const P = D.pos[stop]; for (let i = 0; i < n; i++) bg[3 * i + k] = Math.min(255, Math.round(Gas.lumAt(stop, P[2 * i], P[2 * i + 1]) / LMAX * 255)); });
    attr(4, bg, 3, gl.UNSIGNED_BYTE, true);
    gl.bindVertexArray(null);
  };

  /** Dot size factor: the app's dot rule, relative to its value at Overview. */
  Stars.sizeK = function (coverPx, overviewCoverPx) {
    const dot = (c) => U.clamp(1.8 + c / 3.15, 3, 7.2);
    return dot(coverPx) / dot(12.5);   // relative to the desktop Overview scale, whatever this screen's Overview is
  };

  Stars.draw = function (st) {   // st: {t, alpha, sizeK, halo}
    if (!gl || st.alpha <= 0.003 || RMR.Gas.debug) return;
    const cam = RMR.cam, view = RMR.view, v = RMR.Cam.vis(), u = prog.u, cv = gl.canvas;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(prog.p); gl.bindVertexArray(vao);
    gl.uniform4f(u.u_cam, cam.x, cam.y, cam.ppw, st.t); gl.uniform4f(u.u_view, view.W, view.H, v.cx, v.cy);
    gl.uniform1f(u.u_dpr, cv.width / view.W); gl.uniform1f(u.u_sizeK, st.sizeK); gl.uniform1f(u.u_alpha, st.alpha);
    gl.uniform1f(u.u_halo, st.halo == null ? 1 : st.halo);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(u.u_dark, 1); gl.drawArrays(gl.POINTS, 0, n);
    gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1f(u.u_dark, 0);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
  };
})();
