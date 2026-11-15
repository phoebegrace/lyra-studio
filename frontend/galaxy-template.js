/* Lyrica Studio — original seamless galaxy, lyric-only presentation. */
(function(){
'use strict';
const TAU=Math.PI*2, PERIOD=22;
let seed=711409;
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const stars=Array.from({length:280},()=>({x:random(),y:random(),r:.45+random()*1.7,phase:random()*TAU,speed:1+Math.floor(random()*3),a:.28+random()*.7}));
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
    ctx.translate((c.x+.035*Math.sin(a+c.p))*w,(c.y+.03*Math.cos(a+c.p))*h);
    ctx.rotate(-.28);ctx.scale(c.rX*w,c.rY*h);
    const g=ctx.createRadialGradient(0,0,.03,0,0,1);
    g.addColorStop(0,'rgba('+c.c+','+c.a+')');
    g.addColorStop(.55,'rgba('+c.c+','+(c.a*.28)+')');
    g.addColorStop(1,'rgba('+c.c+',0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
  }
  for(const s of stars){
    ctx.fillStyle='rgba(233,238,255,'+(s.a*(.62+.38*Math.cos(s.speed*a+s.phase)))+')';
    // Slow, seamless diagonal drift over the 22-second starfield loop.
    // Each layer moves slightly differently to create gentle parallax.
    const driftX=(.012+s.speed*.005)*Math.sin(a+s.phase*.18);
    const driftY=(.009+s.speed*.004)*Math.cos(a+s.phase*.18);
    const x=((s.x+driftX+1)%1)*w;
    const y=((s.y+driftY+1)%1)*h;
    ctx.beginPath();ctx.arc(x,y,s.r*w/1280,0,TAU);ctx.fill();
    // Occasional brighter, softly glowing stars help movement read at video size.
    if(s.r>1.65){ctx.fillStyle='rgba(195,167,255,'+(s.a*.13)+')';ctx.beginPath();ctx.arc(x,y,s.r*2.9*w/1280,0,TAU);ctx.fill();}
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
function rounded(ctx,x,y,w,h,r){
  ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);
  else{ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y)}
}
function outroIcon(ctx,kind){
  ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=5;
  ctx.strokeStyle='#f3eaff';ctx.fillStyle='rgba(222,190,255,.2)';
  ctx.beginPath();
  if(kind==='like'){
    // Crisp outline thumb (original vector, not font-dependent emoji).
    ctx.moveTo(-38,-1);ctx.lineTo(-24,-1);ctx.lineTo(-12,-14);
    ctx.lineTo(-2,-36);ctx.quadraticCurveTo(4,-45,12,-40);
    ctx.quadraticCurveTo(16,-36,12,-25);ctx.lineTo(8,-15);
    ctx.lineTo(29,-15);ctx.quadraticCurveTo(40,-15,37,-4);
    ctx.lineTo(26,31);ctx.quadraticCurveTo(23,39,14,39);
    ctx.lineTo(-24,39);ctx.lineTo(-38,30);ctx.closePath();
  }else if(kind==='comment'){
    rounded(ctx,-38,-30,76,55,16);
  }else{
    ctx.moveTo(-28,24);ctx.quadraticCurveTo(-21,11,-21,-6);
    ctx.quadraticCurveTo(-21,-32,0,-34);
    ctx.quadraticCurveTo(21,-32,21,-6);
    ctx.quadraticCurveTo(21,11,28,24);
    ctx.quadraticCurveTo(31,31,23,31);
    ctx.lineTo(-23,31);ctx.quadraticCurveTo(-31,31,-28,24);
    ctx.closePath();
  }
  ctx.fill();ctx.stroke();
  if(kind==='like'){ctx.beginPath();ctx.moveTo(-24,-1);ctx.lineTo(-24,39);ctx.stroke()}
  if(kind==='comment'){
    ctx.beginPath();ctx.moveTo(-12,23);ctx.lineTo(-22,38);ctx.lineTo(4,25);ctx.stroke();
    for(const px of [-18,0,18]){ctx.beginPath();ctx.arc(px,-3,3,0,Math.PI*2);ctx.fillStyle='#f3eaff';ctx.fill()}
  }
  if(kind==='subscribe'){
    ctx.beginPath();ctx.arc(0,34,6,0,Math.PI);ctx.stroke();
    ctx.beginPath();ctx.arc(-31,-12,7,-2.6,-1.5);ctx.stroke();
    ctx.beginPath();ctx.arc(31,-12,7,-1.6,-.5);ctx.stroke();
  }
}
function drawOutro(ctx,t,lastEnd,duration){
  const start=lastEnd+1.04;
  const finish=Math.max(duration||0,start+7.5);
  if(t<start||t>finish)return false;
  const elapsed=t-start;
  const fadeIn=Math.min(1,Math.max(0,elapsed/.75));
  const fadeOut=Math.min(1,Math.max(0,(finish-t)/.78));
  const alpha=(1-Math.pow(1-fadeIn,3))*fadeOut;
  ctx.save();ctx.globalAlpha=alpha;
  const items=[
    {kind:'like',label:'LIKE',x:325},
    {kind:'comment',label:'COMMENT',x:640},
    {kind:'subscribe',label:'SUBSCRIBE',x:955}
  ];
  items.forEach((item,i)=>{
    const phase=Math.max(0,Math.min(1,(elapsed-.55-i*.36)/.63));
    if(!phase)return;
    const pop=1-Math.pow(1-phase,3);
    const overshoot=Math.sin(phase*Math.PI)*.13;
    ctx.save();ctx.globalAlpha=alpha*pop;ctx.translate(item.x,432);
    ctx.scale(pop+overshoot,pop+overshoot);
    ctx.shadowColor='rgba(163,90,255,.54)';ctx.shadowBlur=24;
    ctx.fillStyle='rgba(31,15,63,.75)';
    rounded(ctx,-112,-86,224,184,27);ctx.fill();
    ctx.lineWidth=2;ctx.strokeStyle='rgba(202,151,255,.8)';ctx.stroke();
    ctx.shadowBlur=0;
    ctx.save();ctx.translate(0,-25);outroIcon(ctx,item.kind);ctx.restore();
    ctx.fillStyle='#f9f4ff';ctx.font='750 25px Inter,Arial,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.label,0,55);
    ctx.restore();
  });
  if(elapsed>2.05){
    ctx.save();ctx.globalAlpha=alpha*Math.min(1,(elapsed-2.05)/.65);
    ctx.fillStyle='#deb9ff';ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.font='600 28px Inter,Arial,sans-serif';
    ctx.fillText('FOR MORE!',640,622);
    ctx.restore();
  }
  ctx.restore();return true;
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
  const finalIndex=lines.length-1;
  const finalEnd=getEnd(finalIndex);
  const finalStart=lines[finalIndex].t;


  // Alternating stable positions: #1 at the top, #2 at the bottom,
  // then #3 replaces #1 shortly before #2 finishes, and so forth.
  // The intro and long instrumental pauses stay uncluttered.
  const viewTime=t;
  const longGap=7;
  const visible=[];
  // For long breaks, hide everything until 3s before the NEXT sung phrase.
  // In the opening intro, title + singer are shown instead of lyrics.
  let instrumentalGap=null;
  if(lines[0].t>=longGap && t<lines[0].t)
    instrumentalGap={from:0,to:lines[0].t,isOpening:true};
  for(let n=0;n<lines.length-1;n++){
    const from=getEnd(n),to=lines[n+1].t;
    if(to-from>=longGap && t>=from && t<to){
      instrumentalGap={from,to,isOpening:false};
      break;
    }
  }
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

  // After returning from an instrumental section, never restore a lyric
  // from before that break into the spare row.
  if(!instrumentalGap){
    let lastBreakEndIndex=-1;
    for(let n=0;n<lines.length-1;n++){
      if(lines[n+1].t-getEnd(n)>=longGap && t>=lines[n+1].t)
        lastBreakEndIndex=n+1;
    }
    if(lastBreakEndIndex>=0){
      for(let j=visible.length-1;j>=0;j--)
        if(visible[j].absolute<lastBreakEndIndex)visible.splice(j,1);
    }
  }

  if(instrumentalGap){
    // Clear both stale lines throughout the instrumental break, only
    // revealing the next one during its final three seconds.
    visible.length=0;
    const nextIndex=lines.findIndex(l=>l.t>t);
    if(nextIndex>=0 && t>=instrumentalGap.to-lead){
      const cue=lines[nextIndex];
      visible.push({line:cue,absolute:nextIndex,slot:nextIndex%2,
        opacity:Math.max(0,Math.min(1,(t-(cue.t-lead))/.45))});
    }
  }

  // When the very last lyric begins, it takes over the whole screen.
  // Hold through the last sung word, then fade it out over 1 second.
  if(t>=finalStart && t<finalEnd+1.04 && intro===0){
    visible.length=0;
    visible.push({
      line:lines[finalIndex],absolute:finalIndex,slot:0,
      opacity:t<=finalEnd?1:Math.max(0,1-(t-finalEnd)/1.04),
      solo:true
    });
  }
  if(t>=finalEnd+1.04)visible.length=0;

  // Opening song-title card plays ONLY with the instrumental, never under
  // lyrics. Clear it three seconds before the first sung phrase appears.
  const title=String(options.songTitle||'').trim();
  const singer=String(options.songSinger||'').trim();
  const firstStart=Number(lines[0]?.t);
  const titleEnd=Math.max(0,firstStart-3.15);
  if(title && intro===0 && Number.isFinite(firstStart) && titleEnd>1.3 && t<titleEnd){
    const fadeIn=Math.max(0,Math.min(1,t/.65));
    const fadeOut=Math.max(0,Math.min(1,(titleEnd-t)/.75));
    const alpha=(1-Math.pow(1-fadeIn,3))*fadeOut;
    const scale=1+.015*Math.max(0,Math.min(1,t/Math.max(1,titleEnd)));
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(640,singer?329:356);ctx.scale(scale,scale);
    let size=102;
    while(size>40){
      ctx.font='750 '+size+'px Inter,Arial,sans-serif';
      if(ctx.measureText(title).width<1090)break;
      size-=3;
    }
    ctx.fillStyle='#ffffff';ctx.shadowColor='rgba(128,90,235,.60)';ctx.shadowBlur=36;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(title,0,0);
    if(singer){
      let subSize=31;
      while(subSize>17){
        ctx.font='500 '+subSize+'px Inter,Arial,sans-serif';
        if(ctx.measureText(singer).width<1030)break;
        subSize-=1;
      }
      ctx.fillStyle='rgba(232,224,255,.83)';
      ctx.shadowColor='rgba(103,79,170,.28)';ctx.shadowBlur=12;
      ctx.fillText(singer,0,69);
    }
    ctx.restore();
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
    const {line,absolute,slot:p,opacity,solo}=item;
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
    const middle=solo?368:rowY[p],firstY=middle-(rows.length-1)*lead/2;
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
          // One-letter sung words (especially "I" and "a") can be assigned
          // near-zero acoustic spans. Light them at their detected onset and
          // finish the reveal promptly instead of requiring an invisible sweep.
          // This leaves all multi-letter words and global sync settings alone.
          const tinyWord=/^[A-Za-z]$/.test(word.text.replace(/[“”"'.,!?]/g,''));
          const revealStart=tinyWord?Math.max(line.t,from-.035):from;
          const revealLength=tinyWord?.045:Math.max(.08,to-from);
          const amount=Math.max(0,Math.min(1,(t-delay-revealStart)/revealLength));
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
  // After the solo final lyric fades, show the branded call-to-action outro.
  // It is time-derived, so preview and recorded frames stay identical.
  const isOutro=drawOutro(ctx,t,finalEnd,Number(options.duration)||0);

  ctx.restore();
}

window.LyraGalaxy={draw,period:PERIOD};
})();
