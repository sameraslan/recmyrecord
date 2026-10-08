// ---- shared by the two "fresh" concepts ----
const S=D.view.s,REG=D.regions,AR=D.ar;
const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function hsl(h,s,l){h=((h%360)+360)%360/360;const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;const f=t=>{t=(t+1)%1;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p};return [f(h+1/3)*255,f(h)*255,f(h-1/3)*255]}
const toPx=(x,y)=>[CX+(x-D.view.x)*S,CY-(y-D.view.y)*S];
function chrome(){
  const h=el('header','hdr',`<a class="wm">recmyrecord</a><div class="search">${IC.search}<span>Search albums or artists</span><kbd>/</kbd></div><nav class="nav"><a class="on">Map</a><a>About</a></nav>`);stage.appendChild(h);
  const sim=el('div','sim',`<div class="sim-l">Similarity</div><div class="sim-track"><i style="left:0"></i><i class="on" style="left:50%"></i><i style="left:100%"></i></div><div class="sim-stops"><span>Sonic</span><b>Balanced</b><span>Mood</span></div><div class="sim-d">Sound and mood together.</div>`);
  sim.style.left=(PANEL+22)+'px';sim.style.top=(HDR+22)+'px';stage.appendChild(sim);
  stage.appendChild(el('div','zoom',`<b>${IC.plus}</b><b>${IC.minus}</b><b>${IC.fit}</b>`));
  if(!ALBUM){stage.appendChild(el('div','hint',D.caption));return}
  const s=D.seed,tl=s.t.length>22?'lg':s.t.length>13?'m':'';
  const a=el('aside','album');a.style.setProperty('--acc',s.w[2]);
  a.innerHTML=`<div class="amb"></div><div class="close">${IC.x}</div><div class="album-in">
  <nav class="trail"><span class="l">Visited</span><ol>${D.trail.map(t=>`<li>${t}</li>`).join('')}<li>${s.t}</li></ol></nav>
  <section class="seed"><div class="cv" style="${coverCSS(s.i,116)}"></div><p class="seed-artist">${s.a}</p><h1 class="seed-title ${tl}">${s.t}</h1>
  <div class="seed-actions"><span class="btn">Open in Spotify ${IC.ext}</span><span class="iq">${IC.link}</span></div>
  <ul class="tags">${s.tags.map(t=>`<li class="${(D.recs[HOT].sh.includes(t))?'lit':''}">${t}</li>`).join('')}</ul></section>
  <section class="recs"><h2 class="recs-h">Closest albums</h2>${D.recs.map((r,i)=>`<div class="rec ${i==HOT?'hot':''}"><span class="rec-n">${i+1}</span><div class="cv" style="${coverCSS(r.i,60)}"></div><div class="rec-text"><span class="rec-title">${r.t}</span><span class="rec-artist">${r.a}</span><span class="rec-shared">${r.sh.length?'Shares <span>'+r.sh.join(', ')+'</span>':'&nbsp;'}</span></div><span class="rec-sp">${IC.sp}</span></div>`).join('')}
  <span class="more">Show more <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4l4 4 4-4"/></svg></span></section></div>`;
  stage.appendChild(a);
}
const HOT=2; // which closest album is shown hovered (row + map)
// covers are pushed apart; a leader runs back to the true star
function layoutCovers(){
  if(!ALBUM)return [];
  const B=[{i:D.seed.i,h:32,fix:true}].concat(D.recs.map((r,n)=>({i:r.i,h:23,n})));
  B.forEach(b=>{b.tx=b.x=PX[b.i];b.ty=b.y=PY[b.i]});
  const GAP=22;
  for(let it=0;it<400;it++){
    for(let a=0;a<B.length;a++)for(let c=a+1;c<B.length;c++){const p=B[a],q=B[c];const need=p.h+q.h+GAP;let dx=q.x-p.x,dy=q.y-p.y;const ox=need-Math.abs(dx),oy=need-Math.abs(dy);
      if(ox>0&&oy>0){if(dx==0&&dy==0){dx=.1*(c-a);dy=.07}
        const l=Math.hypot(dx,dy),push=Math.min(ox,oy)*.5+.5,ux=dx/l,uy=dy/l;
        if(p.fix){q.x+=ux*push*2;q.y+=uy*push*2}else{p.x-=ux*push;p.y-=uy*push;q.x+=ux*push;q.y+=uy*push}}}
    for(const b of B){if(b.fix)continue;b.x+=(b.tx-b.x)*.02;b.y+=(b.ty-b.y)*.02;
      b.x=Math.max(PANEL+40,Math.min(W-40,b.x));b.y=Math.max(HDR+44,Math.min(H-40,b.y));
      if(b.x<PANEL+330&&b.y<HDR+200){b.y=HDR+200}}
  }
  return B;
}
function placeCovers(B){
  for(const b of B.slice(1).concat([B[0]])){const m=el('div','mc '+(b.fix?'sd':'rc'));m.style.left=Math.round(b.x)+'px';m.style.top=Math.round(b.y)+'px';m.appendChild(cover(b.i,b.h*2));
    if(!b.fix){m.appendChild(el('span','badge',String(b.n+1)));if(b.n==HOT)m.classList.add('hot')}ov.appendChild(m)}
}
function drawLines(B,o){ // o: {line, casing, glow, w}
  const sd=B[0];ctx.save();ctx.globalCompositeOperation='source-over';ctx.lineCap='round';
  for(const b of B.slice(1)){
    const path=()=>{ctx.beginPath();ctx.moveTo(sd.x,sd.y);ctx.lineTo(b.tx,b.ty);if(Math.hypot(b.x-b.tx,b.y-b.ty)>5)ctx.lineTo(b.x,b.y)};
    ctx.strokeStyle=o.casing;ctx.lineWidth=o.w+4;path();ctx.stroke();
    if(o.glow){ctx.strokeStyle=o.glow;ctx.lineWidth=o.w+9;ctx.globalAlpha=.16;path();ctx.stroke();ctx.globalAlpha=1}
    ctx.strokeStyle=b.n==HOT?o.hot:o.line;ctx.lineWidth=b.n==HOT?o.w+.6:o.w;path();ctx.stroke();
    if(Math.hypot(b.x-b.tx,b.y-b.ty)>5){ctx.fillStyle=o.casing;ctx.beginPath();ctx.arc(b.tx,b.ty,5,0,7);ctx.fill();ctx.fillStyle=o.line;ctx.beginPath();ctx.arc(b.tx,b.ty,2.6,0,7);ctx.fill()}
  }ctx.restore();
}
// region labels (DOM). Returns rects so the canvas can thin the gas and hold stars back under the lettering
function regionLabels(B,labelCol,opts){
  opts=opts||{};const out=[];const blocks=[];
  if(ALBUM){for(const b of B){blocks.push([b.x-b.h-16,b.y-b.h-16,b.x+b.h+16,b.y+b.h+16]);for(let t=0;t<=1;t+=.04){const lx=B[0].x+(b.tx-B[0].x)*t,ly=B[0].y+(b.ty-B[0].y)*t;blocks.push([lx-12,ly-12,lx+12,ly+12])}}blocks.push([PANEL,HDR,PANEL+310,HDR+170]);blocks.push([W-90,H-190,W,H])}
  else{blocks.push([0,HDR,310,HDR+170]);blocks.push([W-90,H-190,W,H]);blocks.push([0,H-64,860,H])}
  const hit=(r)=>blocks.some(k=>r[0]<k[2]&&r[2]>k[0]&&r[1]<k[3]&&r[3]>k[1]);
  const list=REG.map((r,k)=>({r,k})).sort((a,b)=>((b.r.id==opts.on)-(a.r.id==opts.on))||(b.r.strong-a.r.strong)||(b.r.n-a.r.n));
  for(const {r,k} of list){
    if(!r.strong&&opts.noFair)continue;
    const [x,y]=toPx(r.cx,r.cy);
    let fs=(ALBUM?15:17)+(ALBUM?8:9)*Math.sqrt(r.n/346);if(!r.strong)fs=fs*.7+3;
    const sub=r.strong&&!ALBUM;
    const w=(r.name.length*fs*(r.strong?.8:.5))/2+4,hh=(sub?fs*.5+10:fs*.55)+3;
    let ok=false,yy=y,xx=x;
    for(const [ddx,ddy] of [[0,0],[0,-22],[0,22],[-40,0],[40,0],[0,-46],[0,46],[0,-84],[0,84],[-90,0],[90,0],[-80,-60],[80,60],[80,-60],[-80,60],[0,120],[110,90],[160,40],[-110,90],[0,-120],[170,110]]){xx=x+ddx;yy=y+ddy;const rc=[xx-w,yy-hh,xx+w,yy+hh];
      if(rc[0]<PANEL+12||rc[2]>W-12||rc[1]<HDR+12||rc[3]>H-12)continue;
      if(!hit(rc)){ok=true;blocks.push(rc);break}}
    if(!ok)continue;
    const e=el('div','rl'+(r.strong?'':' fair')+(ALBUM?' quiet':'')+(opts.on==r.id?' on':''),`<b style="font-size:${fs.toFixed(1)}px">${r.name}</b>`+(opts.on==r.id?`<span class="ev">${r.ev.replace(/, against (.*)$/,'<i>, against $1</i>')}</span>`:sub?`<span>${r.plain}</span>`:''));
    e.style.left=Math.round(xx)+'px';e.style.top=Math.round(yy)+'px';e.style.setProperty('--lc',labelCol(r));ov.appendChild(e);
    out.push({x:xx,y:yy,w,h:hh,r});
    if(opts.on==r.id){blocks.push([xx-230,yy-hh,xx+230,yy+hh+8]);out[out.length-1].w=Math.max(w,215)}
  }
  return out;
}
// 0..1: how much a pixel sits under a label (soft)
function labelShade(L,x,y){let m=0;for(const l of L){const dx=Math.max(0,Math.abs(x-l.x)-l.w*.75)/(l.w*.5+26),dy=Math.max(0,Math.abs(y-l.y)-l.h*.5)/(l.h*.5+22);const d=dx*dx+dy*dy;if(d<4){const v=Math.exp(-d*1.6);if(v>m)m=v}}return m}
function underLabel(L,x,y){for(const l of L)if(Math.abs(x-l.x)<l.w&&Math.abs(y-l.y)<l.h)return true;return false}
// coarse brightness classes from album order; the long tail is treated as median
function starClass(i){return i<40?0:i<400?1:i<1500?2:i<3800?3:2}
function spike(x,y,ang,L,a,lw,col){const dx=Math.cos(ang)*L,dy=Math.sin(ang)*L;const lg=ctx.createLinearGradient(x-dx,y-dy,x+dx,y+dy);lg.addColorStop(0,`rgba(${col},0)`);lg.addColorStop(.5,`rgba(${col},${a})`);lg.addColorStop(1,`rgba(${col},0)`);ctx.strokeStyle=lg;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);ctx.stroke()}
function halo(x,y,R,a,col){const gr=ctx.createRadialGradient(x,y,0,x,y,R);gr.addColorStop(0,`rgba(${col},${a})`);gr.addColorStop(.3,`rgba(${col},${a*.3})`);gr.addColorStop(1,`rgba(${col},0)`);ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,R,0,7);ctx.fill()}
function pickHov(B,L){const sx=B[0].x,sy=B[0].y;for(let i=0;i<400;i++){if(B.some(b=>b.i==i)||D.t[i][0].length>22)continue;const x=PX[i],y=PY[i];if(x<PANEL+70||x>W-300||y<HDR+210||y>H-80)continue;let ok=true;
  const rc=[x-14,y-40,x+250,y+26];
  for(const b of B)if(rc[0]<b.x+b.h+10&&rc[2]>b.x-b.h-10&&rc[1]<b.y+b.h+10&&rc[3]>b.y-b.h-10)ok=false;
  for(const l of L)if(rc[0]<l.x+l.w&&rc[2]>l.x-l.w&&rc[1]<l.y+l.h&&rc[3]>l.y-l.h)ok=false;
  for(const b of B.slice(1))for(let t=0;t<=1;t+=.04){const lx=sx+(b.tx-sx)*t,ly=sy+(b.ty-sy)*t;if(lx>rc[0]-6&&lx<rc[2]+6&&ly>rc[1]-6&&ly<rc[3]+6)ok=false}
  if(ok)return i}return -1}
function hovCard(i){const hv=el('div','hov');hv.appendChild(cover(i,40));hv.appendChild(el('div','',`<b>${D.t[i][0]}</b><span>${D.t[i][1]}</span>`));hv.style.left=(PX[i]+16)+'px';hv.style.top=(PY[i]-27)+'px';stage.appendChild(hv)}
function pct(G,q,filter){const v=[];for(let i=0;i<N;i+=2){if(filter&&!filter(i))continue;v.push(G.at(PX[i],PY[i]))}v.sort((a,b)=>a-b);return v[Math.floor(v.length*q)]||1e-6}
