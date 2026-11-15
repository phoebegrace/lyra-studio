/* Lyrica Studio — original seamless galaxy, lyric-only presentation. */
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
// Place a lyric on one readable row when possible, otherwise split into two
// balanced rows without leaving a one-word orphan on either row.
function lyricRows(ctx,words,maxWidth){
  const widths=words.map(w=>ctx.measureText(w.text).width);
  const space=ctx.measureText(' ').width;
  const measure=(a,b)=>widths.slice(a,b).reduce((v,n)=>v+n,0)+Math.max(0,b-a-1)*space;
  if(measure(0,words.length)<=maxWidth)return [words];
  if(words.length<4)return null; // keep short phrases together; shrink them instead
  let best=null,score=Infinity;
  for(let cut=2;cut<=words.length-2;cut++){
    const a=measure(0,cut),b=measure(cut,words.length);
    if(a>maxWidth||b>maxWidth)continue;
    const imbalance=Math.abs(a-b);
    const candidate=imbalance+Math.max(a,b)*.10;
    if(candidate<score){score=candidate;best=[words.slice(0,cut),words.slice(cut)]}
  }
  return best;
}
function draw(ctx,w,h,time,lines,options={}){
  const t=Number.isFinite(time)?time:0;
  const galaxyT=Number.isFinite(options.galaxyTime)?options.galaxyTime:t;
  background(ctx,w,h,galaxyT);
  ctx.save();ctx.scale(w/1280,h/720);
  if(!lines?.length){ctx.restore();return}
  const getEnd=index=>{
    const cue=lines[index],following=lines[index+1];
    const explicit=cue?.end;
    return Number.isFinite(explicit)&&explicit>cue.t
      ? explicit:Math.min(following?.t??cue.t+5,cue.t+5);
  };
  const lead=3; // Show a lyric only three seconds before it begins.
  const swapLead=1.15; // Replace the older line near the end of the current line.
  const fade=.3;
  const intro=Math.max(0,Number(options.countdown)||0);
  const rowY=[278,458];
  const syncColor=options.highlight||'#c9b8ff',delay=Number(options.highlightDelay)||0;

  // Alternating stable positions: #1 at the top, #2 at the bottom,
  // then #3 replaces #1 shortly before #2 finishes, and so forth.
  // The intro and long instrumental pauses stay uncluttered.
  const viewTime=t;
  const longGap=7;
  const visible=[];
  for(let slot=0;slot<2;slot++){
    let choice=-1,revealTime=Infinity;
    for(let i=slot;i<lines.length;i+=2){
      const cue=lines[i];
      if(!Number.isFinite(cue.t))continue;
      let eligible=cue.t-lead;
      if(i>=2){
        const preceding=getEnd(i-1);
        // A new stanza replaces the previous stanza only when its
        // immediate predecessor is almost finished. During very long
        // breaks, don't reveal it until shortly before it is sung.
        eligible=Math.max(eligible,preceding-swapLead);
      }
      if(viewTime>=eligible){
        choice=i;revealTime=eligible;
      }else break;
    }
    if(choice<0)continue;
    const latestSung=lines.findLastIndex(l=>Number.isFinite(l.t)&&l.t<=viewTime);
    // If the song is in a long instrumental break, clear the previous
    // couple of lines. They return only when a new phrase approaches.
    if(latestSung>=0){
      const after=getEnd(latestSung);
      const next=lines[latestSung+1];
      const gap=next?.t-after;
      if(gap>=longGap && viewTime>after+.65 && viewTime<next.t-lead){
        continue;
      }
      // After the final lyric ends, clear out the whole lyric area.
      if(!next && viewTime>after+.65)continue;
    }
    const opacity=Math.max(0,Math.min(1,(viewTime-revealTime)/fade));
    visible.push({line:lines[choice],absolute:choice,slot,opacity});
  }

  // Countdown only at the start or ahead of a genuinely long instrumental
  // gap. The timer is small and sits ABOVE the lyric that is about to begin.
  let timerIndex=-1,timerValue=0;
  if(intro>0){
    timerIndex=0;timerValue=Math.ceil(intro);
  }else{
    const nextIndex=lines.findIndex(l=>Number.isFinite(l.t)&&l.t>t);
    if(nextIndex>=0){
      const remaining=lines[nextIndex].t-t;
      const previousEnd=nextIndex===0?0:getEnd(nextIndex-1);
      const gap=lines[nextIndex].t-previousEnd;
      if((nextIndex===0||gap>=longGap)&&remaining>0&&remaining<=3){
        timerIndex=nextIndex;
        timerValue=Math.ceil(remaining);
      }
    }
  }

  for(const item of visible){
    const {line,absolute,slot:p,opacity}=item;
    ctx.save();ctx.globalAlpha=opacity;
    const raw=String(line.text||'').trim().split(/\s+/).filter(Boolean);
    if(!raw.length)continue;
    const words=raw.map((text,index)=>({text,index}));
    let fontSize=52,rows=null;
    for(;fontSize>=16;fontSize-=2){
      ctx.font='750 '+fontSize+'px Inter,Arial,sans-serif';
      rows=lyricRows(ctx,words,1100);
      if(rows)break;
    }
    // Very long unbroken tokens: keep a single line rather than displaying
    // a lonely last word in a narrow column.
    if(!rows)rows=[words];
    const lead=fontSize*1.18;
    const middle=rowY[p],firstY=middle-(rows.length-1)*lead/2;
    const end=getEnd(absolute);
    const isCurrent=t>=line.t&&t<end&&intro===0;
    const isFinished=t>=end;
    ctx.textAlign='left';ctx.textBaseline='middle';
    for(let r=0;r<rows.length;r++){
      const row=rows[r],gap=ctx.measureText(' ').width;
      const widths=row.map(word=>ctx.measureText(word.text).width);
      const total=widths.reduce((n,v)=>n+v,0)+(row.length-1)*gap;
      let x=640-total/2,y=firstY+r*lead;
      for(let j=0;j<row.length;j++){
        const word=row[j],width=widths[j];
        ctx.fillStyle=isFinished?'rgba(255,255,255,.40)':'#fff';
        ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=12;
        ctx.fillText(word.text,x,y);
        if(isCurrent){
          const exact=line.words?.[word.index],hasExact=Number.isFinite(exact?.start);
          const from=hasExact?exact.start:line.t+(end-line.t)*word.index/words.length;
          const to=hasExact
            ? (Number.isFinite(exact.end)&&exact.end>from?exact.end:(line.words?.[word.index+1]?.start??end))
            : line.t+(end-line.t)*(word.index+1)/words.length;
          const amount=Math.max(0,Math.min(1,(t-delay-from)/Math.max(.08,to-from)));
          if(amount>0){
            ctx.save();ctx.beginPath();
            ctx.rect(x-2,y-fontSize*.7,(width+4)*amount,fontSize*1.4);ctx.clip();
            ctx.fillStyle=syncColor;ctx.shadowColor='rgba(177,149,255,.34)';ctx.shadowBlur=12;
            ctx.fillText(word.text,x,y);ctx.restore();
          }
        }
        x+=width+gap;
      }
    }
    ctx.restore();
  }

  if(timerValue>0){
    const p=Math.max(0,timerIndex)%2;
    ctx.font='750 25px Inter,Arial,sans-serif';
    ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.fillStyle='#ffffff';ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=10;
    ctx.fillText(String(timerValue),640,rowY[p]-83);
  }
  ctx.restore();
}

window.LyraGalaxy={draw,period:PERIOD};
})();
