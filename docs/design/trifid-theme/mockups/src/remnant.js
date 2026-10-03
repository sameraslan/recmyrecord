// REMNANT — Cassiopeia A: neutral grey smoke wherever albums are, with fine broken lace over it.
// Lace colour follows the shared five-family rule at capped saturation; lace brightness follows album density only.
chrome();
const B=layoutCovers();
const FAMC=[[236,88,104],[240,172,76],[70,192,170],[84,134,238],[194,104,228]],NEU=[168,164,170];
const CW=D.cw;
function famCol(w,o){const P=2.3;let t=0,s=0,m=0,r=0,g=0,b=0;const q=[0,0,0,0,0];
  for(let j=0;j<5;j++){s+=w[o+j];q[j]=Math.pow(Math.max(0,w[o+j]),P);t+=q[j]}
  if(t<1e-9)return [NEU[0],NEU[1],NEU[2]];
  for(let j=0;j<5;j++){const f=q[j]/t;if(f>m)m=f;r+=FAMC[j][0]*f;g+=FAMC[j][1]*f;b+=FAMC[j][2]*f}
  const neu=w[o+5]/(s+w[o+5]+1e-9),sat=Math.min(1,(.25+1.05*m))*(1-.7*neu);
  return [NEU[0]+(r-NEU[0])*sat,NEU[1]+(g-NEU[1])*sat,NEU[2]+(b-NEU[2])*sat]}
const LAB=regionLabels(B,r=>{const c=famCol(r.fw,0).map(v=>Math.round(v+(255-v)*.66));return `rgb(${c})`},{on:ALBUM?null:'sombre'});
if(!ALBUM)LAB.push({x:400,y:H-30,w:400,h:14,r:null});
const mk=()=>new Grid(4,220);
const g=mk(),G6=[mk(),mk(),mk(),mk(),mk(),mk()];
for(let i=0;i<N;i++){const x=PX[i],y=PY[i];g.splat(x,y,1);for(let j=0;j<6;j++)G6[j].splat(x,y,CW[6*i+j])}
const big=g.copy().blur(.05*S),huge=g.copy().blur(.15*S),far=g.copy().blur(.3*S),vfar=g.copy().blur(.62*S),mid=g.copy().blur(.026*S);
G6.forEach(q=>q.blur(.04*S));
const nb=pct(big,.6),nh=pct(huge,.6),nm=pct(mid,.75),nfar=pct(far,.5),nvf=pct(vfar,.5);
let fx=0,fy=0;if(ALBUM){fx=B[0].x;fy=B[0].y;let cx=0,cy=0;for(const b of B){cx+=b.x;cy+=b.y}fx=(fx+cx/B.length)/2;fy=(fy+cy/B.length)/2}
function fbmG(x,y,o){let s=0,a=1,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f+i*17.3,y*f+i*9.1);n+=a;a*=.64;f*=2.07}return s/n}
const img=ctx.createImageData(W,H),px=img.data;
const F=1/.21,OC=S>1000?6:5,PW=S>1000?22:15,w1=[0,0,0,0,0,0];
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const mx=(x-CX)/S+D.view.x,my=-(y-CY)/S+D.view.y,u=mx*F+20,v=-my*F+20;
  const qx=fbm(u+1.7,v+9.2,4)-.47,qy=fbm(u+8.3,v+2.8,4)-.47;
  const b=fbmG(u*1.2+qx*2.6,v*1.2+qy*2.6,OC+1);
  const dH=huge.at(x,y)/nh,dB=big.at(x,y)/nb,dM=Math.min(2.2,mid.at(x,y)/nm);
  // smoke: grey wisps with hollows, carried thinly to every edge
  const wisp=1-Math.abs(2*fbmG(u*.95+qy*2.2+31,v*.95+qx*2.2+7,OC+2)-1);
  const hollow=sm(.4,.6,fbmG(u*1.9+qx*1.5+60,v*1.9+qy*1.5+44,OC+1));
  let smoke=(sm(.04,1.25,dH*.55+dB*.55)+.3*sm(.05,1.1,far.at(x,y)/nfar)+.14*sm(0,1.1,vfar.at(x,y)/nvf)+.03)*(.12+1.5*Math.pow(wisp,2.6))*(.06+.94*hollow)*(.55+.9*b)*1.3;
  // lace: thin ridges, broken into short lengths; how bright it is depends only on how many albums are there
  const f1=fbmG(u*2.6+qx*3.4+40,v*2.6+qy*3.4+13,OC+1),f2=fbmG(u*5.1+qy*2.6+71,v*5.1+qx*2.6+29,OC);
  const r1=1-Math.abs(2*f1-1),r2=1-Math.abs(2*f2-1);
  const brk=sm(.42,.56,fbm(u*7+11,v*7+3,2));
  const lace=(Math.pow(r1,PW)+Math.pow(r2,PW*1.3)*.8)*brk;
  let E=(lace+Math.pow(r1,5)*.1)*Math.pow(dM,.85)*1.25;
  let s1=0;for(let j=0;j<6;j++){w1[j]=G6[j].at(x,y);s1+=w1[j]}
  const c=s1>1e-7?famCol(w1,0):NEU;
  let k=1;
  if(ALBUM){const d=Math.hypot(x-fx,y-fy);k=.8*(1-.86*Math.exp(-d*d/(2*240*240)))}
  const ls=labelShade(LAB,x,y);k*=1-.72*ls;
  E*=k;smoke*=k;
  const tint=sm(.05,.9,dB)*.62;                      // smoke takes a little of the local colour where albums are dense
  const sR=.150+(c[0]/255*.21-.150)*tint,sG=.150+(c[1]/255*.21-.150)*tint,sB=.165+(c[2]/255*.21-.165)*tint;
  const hot=E*E*.5;
  let r=c[0]/255*E*1.9+hot+smoke*sR,gg=c[1]/255*E*1.9+hot*.97+smoke*sG,bb=c[2]/255*E*1.9+hot*.95+smoke*sB;
  r=1-Math.exp(-1.4*r);gg=1-Math.exp(-1.4*gg);bb=1-Math.exp(-1.4*bb);
  const n=(NT[(x*7+y*131)&65535]-.5)*.012;
  const p=(y*W+x)*4;px[p]=255*Math.min(1,Math.max(0,.022+r+n));px[p+1]=255*Math.min(1,Math.max(0,.023+gg+n));px[p+2]=255*Math.min(1,Math.max(0,.032+bb+n));px[p+3]=255;
}
ctx.putImageData(img,0,0);
{const t=document.createElement('canvas');t.width=W;t.height=H;t.getContext('2d').putImageData(img,0,0);ctx.save();ctx.globalCompositeOperation='lighter';ctx.filter='blur(10px)';ctx.globalAlpha=.2;ctx.drawImage(t,0,0);ctx.restore()}
ctx.globalCompositeOperation='lighter';
const zk=Math.max(1,Math.min(1.3,S/800));
const RAD=[2.5,1.7,1.15,.8],ALP=[1,.95,.85,.7];
for(let i=N-1;i>=0;i--){const x=PX[i],y=PY[i];if(x<-20||x>W+20||y<-20||y>H+20)continue;const c=ACC[i],cl=starClass(i);
  const col=[0,1,2].map(j=>Math.round([214,226,255][j]*.72+c[j]*.28+ (255-[214,226,255][j])*.25));
  let a=ALP[cl]*(ALBUM?.8:1);const ul=underLabel(LAB,x,y);if(ul)a*=.06;
  if(ALBUM&&x<PANEL)a*=.5;
  if(cl<=1&&!ul)halo(x,y,RAD[cl]*zk*(cl==0?5.5:3.4),a*(cl==0?.5:.3),col);
  if(i<8&&!ul){const L=(9+9*(1-i/8))*zk;for(const d of [90,30,150])spike(x,y,d*Math.PI/180,L,.6*a,1,col)}
  ctx.fillStyle=`rgba(${col},${a})`;ctx.beginPath();ctx.arc(x,y,RAD[cl]*zk,0,7);ctx.fill()}
ctx.globalCompositeOperation='source-over';
if(ALBUM){
  drawLines(B,{line:'rgba(255,255,255,.97)',hot:'#fff',casing:'rgba(4,5,9,.88)',glow:'#ffffff',w:1.5});
  placeCovers(B);
  const hv=pickHov(B,LAB);if(hv>=0){hovCard(hv);ctx.strokeStyle='rgba(4,5,9,.8)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(PX[hv],PY[hv],9,0,7);ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(PX[hv],PY[hv],9,0,7);ctx.stroke()}
}
