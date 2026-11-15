/* Lyra Studio — original seamless galaxy, minimal lyric-only presentation. */
(function(){
'use strict';
const TAU=Math.PI*2, PERIOD=22;
let seed=711409;
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const stars=Array.from({length:220},()=>({x:random(),y:random(),r:.4+random()*1.35,phase:random()*TAU,speed:1+Math.floor(random()*3),a:.25+random()*.68}));
const clouds=[
  {x:.26,y:.36,rX:.45,rY:.32,c:'78,52,135',a:.21,p:0},
  {x:.74,y:.63,rX:.42,rY:.24,c:'43,65,148',a:.18,p:2.1},
  {x:.49,y:.18,rX:.25,rY:.21,c:'121,65,137',a:.10,p:3.2}
];
function background(ctx,w,h,time){
  const a=TAU*((time%PERIOD)/PERIOD);
  ctx.fillStyle='#030409';ctx.fillRect(0,0,w,h);
  for(const c of clouds){
    ctx.save();
    ctx.translate((c.x+.018*Math.sin(a+c.p))*w,(c.y+.024*Math.cos(a+c.p))*h);
    ctx.rotate(-.28);ctx.scale(c.rX*w,c.rY*h);
    const g=ctx.createRadialGradient(0,0,.03,0,0,1);
    g.addColorStop(0,'rgba('+c.c+','+c.a+')');
    g.addColorStop(.55,'rgba('+c.c+','+(c.a*.28)+')');
    g.addColorStop(1,'rgba('+c.c+',0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
  }
  for(const s of stars){
    ctx.fillStyle='rgba(233,238,255,'+(s.a*(.76+.24*Math.cos(s.speed*a+s.phase)))+')';
    ctx.beginPath();ctx.arc((s.x+.002*Math.sin(a+s.phase))*w,(s.y+.002*Math.cos(a+s.phase))*h,s.r*w/1280,0,TAU);ctx.fill();
  }
  const vignette=ctx.createRadialGradient(w*.5,h*.5,w*.1,w*.5,h*.5,w*.74);
  vignette.addColorStop(0,'rgba(0,0,0,.08)');vignette.addColorStop(1,'rgba(0,0,0,.67)');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
}
function wrap(ctx,words,maxWidth){
  const rows=[];let row=[];
  for(const token of words){
    const current=[...row,token].map(x=>x.text).join(' ');
    if(row.length && ctx.measureText(current).width>maxWidth){rows.push(row);row=[token]}else row.push(token);
  }
  if(row.length)rows.push(row);
  return rows;
}
function draw(ctx,w,h,time,lines,options={}){
  const t=Number.isFinite(time)?time:0;
  const galaxyT=Number.isFinite(options.galaxyTime)?options.galaxyTime:t;
  background(ctx,w,h,galaxyT);
  const sx=w/1280,sy=h/720;
  ctx.save();ctx.scale(sx,sy);
  const countdown=Number(options.countdown)||0;
  if(countdown>0){
    ctx.font='700 142px Inter,Arial,sans-serif';
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(186,165,255,.45)';ctx.shadowBlur=35;
    ctx.fillText(String(Math.ceil(countdown)),640,350);
    ctx.restore();return;
  }
  if(!lines?.length){ctx.restore();return}
  let index=-1;
  for(let i=0;i<lines.length;i++){if(t>=lines[i].t)index=i;else break}
  if(index<0){
    const remaining=lines[0].t-t;
    if(remaining<=5&&remaining>0){
      ctx.font='600 92px Inter,Arial,sans-serif';ctx.fillStyle='rgba(255,255,255,.96)';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(Math.ceil(remaining)),640,360);
    }
    ctx.restore();return;
  }
  const line=lines[index],next=lines[index+1];
  if(next && t>=next.t){ctx.restore();return}
  const end=Math.max(line.t+.2,next?.t||options.duration||line.t+5);
  const raw=line.text.split(/\s+/).filter(Boolean);
  const words=raw.map((text,i)=>({text,index:i}));
  if(!words.length){ctx.restore();return}
  let size=64,rows=[];
  const maxWidth=1090;
  while(size>=35){
    ctx.font='750 '+size+'px Inter,Arial,sans-serif';
    rows=wrap(ctx,words,maxWidth);
    if(rows.length<=3 && rows.every(row=>ctx.measureText(row.map(x=>x.text).join(' ')).width<=maxWidth))break;
    size-=3;
  }
  ctx.font='750 '+size+'px Inter,Arial,sans-serif';
  ctx.textBaseline='middle';ctx.textAlign='left';
  const leading=size*1.38,firstY=360-(rows.length-1)*leading/2;
  for(let r=0;r<rows.length;r++){
    const row=rows[r];
    const lengths=row.map(word=>ctx.measureText(word.text).width);
    const gap=ctx.measureText(' ').width;
    const total=lengths.reduce((a,b)=>a+b,0)+(row.length-1)*gap;
    let x=640-total/2;
    for(let j=0;j<row.length;j++){
      const word=row[j];
      const start=line.words?.[word.index]?.start;
      const threshold=Number.isFinite(start)?start:line.t+(end-line.t)*(word.index+.5)/words.length;
      const spoken=t>=threshold;
      ctx.fillStyle=spoken?(options.highlight||'#c8b8ff'):'#ffffff';
      ctx.shadowColor=spoken?'rgba(177,149,255,.48)':'rgba(0,0,0,.65)';
      ctx.shadowBlur=spoken?19:13;
      ctx.fillText(word.text,x,firstY+r*leading);
      x+=lengths[j]+gap;
    }
  }
  ctx.restore();
}
window.LyraGalaxy={draw,period:PERIOD};
})();
