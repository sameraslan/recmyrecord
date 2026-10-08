// TRIFID — one emission/reflection nebula coloured by the shared five-family rule (regions/colour.json):
// rose fierce, gold warm, teal quiet, blue dark, violet urban. Gas is lit wherever albums are; dust lanes are atmosphere only.
chrome();
const B=layoutCovers();
const FAMC=[[236,72,96],[246,172,60],[46,186,164],[60,116,244],[196,92,232]],NEU=[150,140,138];
const CW=D.cw;
function famCol(w,o){ // w: five weights + neutral share at offset o
  const P=2.3;let t=0,s=0,m=0,r=0,g=0,b=0;const q=[0,0,0,0,0];
  for(let j=0;j<5;j++){s+=w[o+j];q[j]=Math.pow(Math.max(0,w[o+j]),P);t+=q[j]}
  if(t<1e-9)return [NEU[0],NEU[1],NEU[2]];
  for(let j=0;j<5;j++){const f=q[j]/t;if(f>m)m=f;r+=FAMC[j][0]*f;g+=FAMC[j][1]*f;b+=FAMC[j][2]*f}
  const neu=w[o+5]/(s+w[o+5]+1e-9),sat=Math.min(1,(.25+1.05*m))*(1-.7*neu);   // weak fits and neutral share lose colour
  return [NEU[0]+(r-NEU[0])*sat,NEU[1]+(g-NEU[1])*sat,NEU[2]+(b-NEU[2])*sat]}
const LAB=regionLabels(B,r=>{const c=famCol(r.fw,0).map(v=>Math.round(v+(255-v)*.7));return `rgb(${c})`},{on:ALBUM?null:'playful'});
if(!ALBUM)LAB.push({x:400,y:H-30,w:400,h:14,r:null});
const mk=()=>new Grid(4,220);
const g=mk(),G6=[mk(),mk(),mk(),mk(),mk(),mk()];
for(let i=0;i<N;i++){const x=PX[i],y=PY[i];g.splat(x,y,1);for(let j=0;j<6;j++)G6[j].splat(x,y,CW[6*i+j])}
const big=g.copy().blur(.05*S),huge=g.copy().blur(.14*S),far=g.copy().blur(.3*S),vfar=g.copy().blur(.62*S),fine=g.copy().blur(.016*S);
const H6=G6.map(q=>q.copy().blur(.13*S));G6.forEach(q=>q.blur(.034*S));
const nb=pct(big,.6),nh=pct(huge,.6),nf=pct(fine,.85),nfar=pct(far,.5),nvf=pct(vfar,.5);
let fx=0,fy=0;if(ALBUM){fx=B[0].x;fy=B[0].y;let cx=0,cy=0;for(const b of B){cx+=b.x;cy+=b.y}fx=(fx+cx/B.length)/2;fy=(fy+cy/B.length)/2}
function fbmG(x,y,o){let s=0,a=1,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f+i*17.3,y*f+i*9.1);n+=a;a*=.6;f*=2.07}return s/n}
const img=ctx.createImageData(W,H),px=img.data;
const F=1/.2,OC=S>1000?6:5,w1=[0,0,0,0,0,0],w2=[0,0,0,0,0,0];
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const mx=(x-CX)/S+D.view.x,my=-(y-CY)/S+D.view.y,u=mx*F+20,v=-my*F+20;
  const qx=fbm(u+1.7,v+9.2,4)-.47,qy=fbm(u+8.3,v+2.8,4)-.47;
  const b=fbmG(u*1.25+qx*2.8,v*1.25+qy*2.8,OC+1);
  const dB=big.at(x,y)/nb,dH=huge.at(x,y)/nh,dF=Math.min(2,fine.at(x,y)/nf),dFar=far.at(x,y)/nfar,dV=vfar.at(x,y)/nvf;
  // lit gas wherever albums are; a thin neutral far field carries to every edge so the cloud has no outline
  const near=sm(.02,1.6,dB*.7+dH*.55);
  let L=(near*.84+.2*sm(.05,1.3,dFar)+.085*sm(0,1.1,dV)+.03)*(.32+1.2*b*b*1.6);
  // colour from the family weights: local where albums are, wider average further out, neutral in the far field
  let s1=0,s2=0;for(let j=0;j<6;j++){w1[j]=G6[j].at(x,y);w2[j]=H6[j].at(x,y);s1+=w1[j];s2+=w2[j]}
  let c=NEU;if(s2>1e-7){c=famCol(w2,0);if(s1>1e-7){const c1=famCol(w1,0),tt=sm(0,nb*.1,s1);c=[c[0]+(c1[0]-c[0])*tt,c[1]+(c1[1]-c[1])*tt,c[2]+(c1[2]-c[2])*tt]}
    const t2=sm(.02,.45,dFar);c=[NEU[0]+(c[0]-NEU[0])*t2,NEU[1]+(c[1]-NEU[1])*t2,NEU[2]+(c[2]-NEU[2])*t2]}
  // dust: thin, sharp, dark lanes that only show against bright gas; pure atmosphere, not tied to where albums are
  const rd=1-Math.abs(2*fbmG(u*1.5+qy*2.8+40,v*1.5+qx*2.8+13,OC)-1);
  const rd2=1-Math.abs(2*fbmG(u*3.1+qx*2.2+71,v*3.1+qy*2.2+29,OC)-1);
  const gate=sm(.54,.7,fbmG(u*.8+90,v*.8+55,3));
  const lane=Math.min(1,(sm(.9,.96,rd)*gate+sm(.93,.975,rd2)*.5*gate))*sm(.3,.75,L);
  let k=1,des=0;
  if(ALBUM){const d=Math.hypot(x-fx,y-fy);const e=Math.exp(-d*d/(2*230*230));k=.74*(1-.8*e);des=.6*e}
  const ls=labelShade(LAB,x,y);k*=1-.6*ls;
  const A=1-.9*lane;
  const core=Math.pow(dF,1.6)*.1*sm(.3,1,dB);
  L*=k;
  if(des>0){const m=(c[0]+c[1]+c[2])/3;c=[c[0]+(m-c[0])*des,c[1]+(m-c[1])*des,c[2]+(m-c[2])*des]}
  let r=(c[0]/255*L*.95+core*k)*A,gg=(c[1]/255*L*.95+core*k*.94)*A,bb=(c[2]/255*L*.95+core*k*.86)*A;
  const hi=Math.pow(Math.max(0,L-.55),2)*.5*A;r+=hi;gg+=hi*.94;bb+=hi*.86;
  const EX=ALBUM?1.55:1.3;r=1-Math.exp(-EX*r);gg=1-Math.exp(-EX*gg);bb=1-Math.exp(-EX*bb);
  const n=(NT[(x*7+y*131)&65535]-.5)*.012;
  const p=(y*W+x)*4;px[p]=255*Math.min(1,Math.max(0,.024+r+n));px[p+1]=255*Math.min(1,Math.max(0,.022+gg+n));px[p+2]=255*Math.min(1,Math.max(0,.034+bb+n));px[p+3]=255;
}
ctx.putImageData(img,0,0);
{const t=document.createElement('canvas');t.width=W;t.height=H;t.getContext('2d').putImageData(img,0,0);ctx.save();ctx.globalCompositeOperation='lighter';ctx.filter='blur(18px)';ctx.globalAlpha=.18;ctx.drawImage(t,0,0);ctx.restore()}
ctx.globalCompositeOperation='lighter';
const zk=Math.max(1,Math.min(1.3,S/800));
const RAD=[2.5,1.7,1.15,.8],ALP=[1,.95,.85,.72];
for(let i=N-1;i>=0;i--){const x=PX[i],y=PY[i];if(x<-20||x>W+20||y<-20||y>H+20)continue;const c=ACC[i],cl=starClass(i);
  const col=[0,1,2].map(j=>Math.round(255*.72+c[j]*.28));
  let a=ALP[cl]*(ALBUM?.82:1);const ul=underLabel(LAB,x,y);if(ul)a*=.06;
  if(ALBUM&&x<PANEL)a*=.5;
  if(cl<=1&&!ul)halo(x,y,RAD[cl]*zk*(cl==0?5.5:3.4),a*(cl==0?.5:.3),col);
  if(i<8&&!ul){const L=(8+8*(1-i/8))*zk;for(const d of [0,90])spike(x,y,d*Math.PI/180,L,.6*a,1,col)}
  ctx.fillStyle=`rgba(${col},${a})`;ctx.beginPath();ctx.arc(x,y,RAD[cl]*zk,0,7);ctx.fill()}
ctx.globalCompositeOperation='source-over';
if(ALBUM){
  drawLines(B,{line:'rgba(190,255,236,.98)',hot:'#ffffff',casing:'rgba(7,6,10,.85)',glow:'#befff0',w:1.4});
  placeCovers(B);
  const hv=pickHov(B,LAB);if(hv>=0){hovCard(hv);ctx.strokeStyle='rgba(7,6,10,.8)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(PX[hv],PY[hv],9,0,7);ctx.stroke();ctx.strokeStyle='#befff0';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(PX[hv],PY[hv],9,0,7);ctx.stroke()}
}
