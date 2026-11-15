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
  ctx.save();ctx.scale(w/1280,h/720);
  if(!lines?.length){ctx.restore();return}

  // Four complete sung phrases per screen. The next three phrases stay visible
  // in white, ready before their turn. Advance to the next page every 4 lines.
  let active=-1;
  for(let i=0;i<lines.length;i++){
    if(Number.isFinite(lines[i].t)&&t>=lines[i].t)active=i;
    else break;
  }
  const pageStart=Math.floor(Math.max(0,active)/4)*4;
  const page=lines.slice(pageStart,pageStart+4);
  const rowY=[191,302,413,524];
  const syncColor=options.highlight||'#c9b8ff';
  const delay=Number(options.highlightDelay)||0;
  const intro=Math.max(0,Number(options.countdown)||0);

  // Determine the next phrase that has not started. We put its small
  // countdown ABOVE the actual next phrase, never in the middle of the page.
  let upcoming=lines.findIndex(l=>Number.isFinite(l.t)&&l.t>t);
  if(upcoming<0)upcoming=lines.length;
  const upcomingLocal=upcoming-pageStart;
  let countLeft=0;
  if(intro>0 && pageStart===0){
    upcoming=0;countLeft=intro;
  }else if(upcoming<lines.length){
    const delta=lines[upcoming].t-t;
    if(delta>0 && delta<=5)countLeft=delta;
  }

  for(let p=0;p<page.length;p++){
    const line=page[p],absolute=pageStart+p;
    const raw=String(line.text||'').trim().split(/\s+/).filter(Boolean);
    if(!raw.length)continue;
    const words=raw.map((text,index)=>({text,index}));
    let fontSize=44,rows=[];
    // Fit one long lyric phrase into at most two lines where possible;
    // use a smaller font instead of clipping or covering the next stanza.
    for(;fontSize>=20;fontSize-=2){
      ctx.font='750 '+fontSize+'px Inter,Arial,sans-serif';
      rows=wrap(ctx,words,1100);
      if(rows.length<=2)break;
    }
    ctx.font='750 '+fontSize+'px Inter,Arial,sans-serif';
    const lead=fontSize*1.16;
    const mid=rowY[p];
    const firstY=mid-(rows.length-1)*lead/2;
    const next=lines[absolute+1];
    const explicitEnd=Number(line.end);
    const inferredEnd=Math.min(next?.t ?? (line.t+5),line.t+5);
    const end=Number.isFinite(explicitEnd)&&explicitEnd>line.t?explicitEnd:inferredEnd;
    const isCurrent=absolute===active && t<end && intro===0;
    const isFinished=absolute<active || (absolute===active && t>=end);
    ctx.textBaseline='middle';ctx.textAlign='left';
    for(let r=0;r<rows.length;r++){
      const row=rows[r],gap=ctx.measureText(' ').width;
      const widths=row.map(word=>ctx.measureText(word.text).width);
      const total=widths.reduce((n,v)=>n+v,0)+(row.length-1)*gap;
      let x=640-total/2;
      const y=firstY+r*lead;
      for(let j=0;j<row.length;j++){
        const word=row[j],width=widths[j];
        ctx.fillStyle=isFinished?'rgba(255,255,255,.40)':'#ffffff';
        ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=12;
        ctx.fillText(word.text,x,y);
        if(isCurrent){
          const exact=line.words?.[word.index];
          const hasExact=Number.isFinite(exact?.start);
          // Prefer true word timestamps from the AI aligner. SRT-only tracks
          // use an approximate visual sweep within their line time range.
          const start=hasExact?exact.start:line.t+(end-line.t)*word.index/words.length;
          const finish=hasExact
            ? (Number.isFinite(exact.end)&&exact.end>start?exact.end:(line.words?.[word.index+1]?.start??end))
            : line.t+(end-line.t)*(word.index+1)/words.length;
          const fraction=Math.max(0,Math.min(1,(t-delay-start)/Math.max(.08,finish-start)));
          if(fraction>0){
            ctx.save();ctx.beginPath();
            ctx.rect(x-2,y-fontSize*.7,(width+4)*fraction,fontSize*1.4);ctx.clip();
            ctx.fillStyle=syncColor;ctx.shadowColor='rgba(177,149,255,.34)';ctx.shadowBlur=12;
            ctx.fillText(word.text,x,y);ctx.restore();
          }
        }
        x+=width+gap;
      }
    }
  }

  if(countLeft>0 && upcomingLocal>=0 && upcomingLocal<page.length){
    // Compact timer at the top of the next lyric, using the same Inter type.
    const y=rowY[upcomingLocal]-57;
    ctx.font='750 26px Inter,Arial,sans-serif';
    ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.fillStyle='#ffffff';ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=10;
    ctx.fillText(String(Math.ceil(countLeft)),640,y);
  }
  ctx.restore();
}

window.LyraGalaxy={draw,period:PERIOD};
})();
