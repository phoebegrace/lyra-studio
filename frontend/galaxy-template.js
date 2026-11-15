/* An original seamless black-galaxy karaoke canvas, shared by preview and export.
 * All stars and nebulae are generated from constants; no external media or licensing.
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2, PERIOD = 24;
  const rnd = (() => { let seed = 937241; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const stars = Array.from({length: 195}, () => ({
    x:rnd(), y:rnd(), r:.45+rnd()*1.55, phase:rnd()*TAU, speed:1+Math.floor(rnd()*3), alpha:.28+rnd()*.7
  }));
  const nebulae = [
    {x:.25,y:.35,rx:.46,ry:.26,color:[83,59,145],alpha:.19,phase:0},
    {x:.70,y:.66,rx:.35,ry:.19,color:[55,70,156],alpha:.16,phase:1.9},
    {x:.56,y:.21,rx:.27,ry:.13,color:[110,62,143],alpha:.09,phase:3.2}
  ];
  function bg(ctx,w,h,t,mode,color){
    if(mode==='solid'){ctx.fillStyle=color||'#05060b';ctx.fillRect(0,0,w,h);return}
    const phase=TAU*((t%PERIOD)/PERIOD);
    ctx.fillStyle='#02030a';ctx.fillRect(0,0,w,h);
    const wash=ctx.createLinearGradient(0,0,w,h);
    wash.addColorStop(0,'#050713');wash.addColorStop(.44,'#03050d');wash.addColorStop(1,'#080714');
    ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
    for(const n of nebulae){
      const x=(n.x+Math.sin(phase+n.phase)*.035)*w;
      const y=(n.y+Math.cos(phase+n.phase)*.027)*h;
      ctx.save();ctx.translate(x,y);ctx.rotate(-.28);
      ctx.scale(n.rx*w,n.ry*h);
      const halo=ctx.createRadialGradient(0,0,.03,0,0,1);
      const rgb=n.color.join(',');
      halo.addColorStop(0,'rgba('+rgb+','+n.alpha+')');
      halo.addColorStop(.5,'rgba('+rgb+','+(n.alpha*.27)+')');
      halo.addColorStop(1,'rgba('+rgb+',0)');
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();
    }
    for(const s of stars){
      const px=(s.x + .003*Math.sin(phase+s.phase))*w;
      const py=(s.y + .003*Math.cos(phase+s.phase))*h;
      const a=s.alpha*(.68+.32*Math.sin(s.speed*phase+s.phase));
      ctx.fillStyle='rgba(237,242,255,'+Math.max(.1,a)+')';
      ctx.beginPath();ctx.arc(px,py,s.r*w/1280,0,TAU);ctx.fill();
    }
    const vignette=ctx.createRadialGradient(w*.5,h*.52,w*.15,w*.5,h*.5,w*.72);
    vignette.addColorStop(0,'rgba(0,0,0,0)');
    vignette.addColorStop(1,'rgba(0,0,0,.66)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  }
  function wrap(ctx,text,maxWidth){
    const words=text.split(/\s+/).filter(Boolean), out=[];
    for(const word of words){
      const proposed=out.length ? out[out.length-1]+' '+word : word;
      if(out.length && ctx.measureText(proposed).width<=maxWidth)out[out.length-1]=proposed;
      else if(!out.length)out.push(word);
      else out.push(word);
    }
    return out;
  }
  function wrapMeasured(ctx,text,maxWidth){
    const words=text.split(/\s+/).filter(Boolean), rows=[];
    let row='';
    for(const word of words){
      const attempt=row ? row+' '+word : word;
      if(row && ctx.measureText(attempt).width>maxWidth){rows.push(row);row=word}else row=attempt;
    }
    if(row)rows.push(row);
    return rows;
  }
  function wordRuns(ctx,line,now,end,baseColor,highlightColor,maxWidth,fontSize){
    const tokens=line.text.split(/\s+/).filter(Boolean);
    const measured=tokens.map((word,i)=>({text:word,index:i,width:ctx.measureText(word+' ').width}));
    const rows=[];let current=[],total=0;
    for(const token of measured){
      if(total+token.width>maxWidth && current.length){rows.push(current);current=[];total=0}
      current.push(token);total+=token.width;
    }
    if(current.length)rows.push(current);
    const spacing=fontSize*1.35, top=-((rows.length-1)*spacing)/2;
    rows.forEach((row,ri)=>{
      const rowWidth=row.reduce((sum,w)=>sum+w.width,0);
      let x=-rowWidth/2;
      for(const word of row){
        let active=false;
        if(line.words && line.words[word.index])active=now>=line.words[word.index].start;
        else active=now>=line.t+(Math.max(.3,end-line.t)*((word.index+.75)/Math.max(1,tokens.length)));
        ctx.fillStyle=active?highlightColor:baseColor;
        if(active){ctx.shadowColor=highlightColor;ctx.shadowBlur=9}else ctx.shadowBlur=0;
        ctx.textAlign='left';ctx.fillText(word.text,x,top+ri*spacing);
        x+=word.width;
      }
    });
    ctx.shadowBlur=0;
  }
  function draw(ctx,w,h,time,lines,options={}){
    const scale=w/1280;
    const currentIndex=(()=>{
      let at=-1;for(let i=0;i<lines.length;i++){if(time>=lines[i].t)at=i;else break}return at;
    })();
    const activeIndex=currentIndex<0 ? 0 : currentIndex;
    const page=Math.floor(activeIndex/4)*4;
    bg(ctx,w,h,options.galaxyTime ?? time,options.mode,options.background);
    ctx.save();ctx.scale(scale,scale);
    // Editorial masthead, tucked away from the lyrics.
    ctx.textAlign='left';ctx.font='600 15px Inter, Arial, sans-serif';
    ctx.letterSpacing='3px';ctx.fillStyle='rgba(225,229,255,.66)';
    ctx.fillText('L Y R A    /    K A R A O K E',66,88);
    ctx.textAlign='right';ctx.font='500 15px Inter, Arial, sans-serif';ctx.letterSpacing='2px';
    ctx.fillStyle='rgba(225,229,255,.52)';
    ctx.fillText('GALAXY   /   04',1214,88);
    ctx.letterSpacing='0px';
    const gap=21, left=66, colWidth=(1280-left*2-gap*3)/4;
    for(let i=0;i<4;i++){
      const line=lines[page+i],x=left+(colWidth+gap)*i+colWidth/2;
      const active=currentIndex===page+i;
      if(!line)continue;
      const alpha=active?1:((page+i<currentIndex)?0.28:0.66);
      const words=line.text.split(/\s+/).filter(Boolean);
      let fontSize=words.length>14?28:words.length>10?31:words.length>7?34:38;
      ctx.font='700 '+fontSize+'px Inter, Arial, sans-serif';
      let wrapped=wrapMeasured(ctx,line.text,colWidth-12);
      while((wrapped.length>5 || wrapped.some(r=>ctx.measureText(r).width>colWidth)) && fontSize>25){
        fontSize-=2;ctx.font='700 '+fontSize+'px Inter, Arial, sans-serif';
        wrapped=wrapMeasured(ctx,line.text,colWidth-12);
      }
      // Keep the complete column readable, even with very long words/phrases.
      const centerY=360;
      ctx.save();ctx.translate(x,centerY);
      ctx.globalAlpha=alpha;
      const base=active?'#f7f7ff':'#e2e2ee';
      const accent=options.highlight||'#c5b9ff';
      if(active)wordRuns(ctx,line,time,lines[page+i+1]?.t||options.duration||line.t+4,base,accent,colWidth-12,fontSize);
      else{
        ctx.textAlign='center';ctx.fillStyle=base;
        ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=10;
        const spacing=fontSize*1.35;const top=-((wrapped.length-1)*spacing)/2;
        wrapped.forEach((row,j)=>ctx.fillText(row,0,top+j*spacing));
      }
      ctx.restore();
      ctx.textAlign='center';ctx.font='600 13px Inter, Arial, sans-serif';
      ctx.fillStyle=active?'rgba(209,190,255,.9)':'rgba(213,219,246,.35)';
      ctx.fillText(String(page+i+1).padStart(2,'0'),x,583);
      if(active){ctx.fillStyle=options.highlight||'#c5b9ff';ctx.fillRect(x-17,607,34,3)}
    }
    if(!lines.length){
      ctx.font='700 48px Inter, Arial, sans-serif';ctx.fillStyle='#f8f8ff';ctx.textAlign='center';
      ctx.fillText('Your lyrics. The whole universe.',640,343);
      ctx.font='500 21px Inter, Arial, sans-serif';ctx.fillStyle='rgba(221,220,243,.73)';
      ctx.fillText('Four columns · A galaxy that moves with your music',640,397);
    }
    if(lines.length && currentIndex<0){
      ctx.font='600 17px Inter, Arial, sans-serif';ctx.textAlign='center';
      ctx.fillStyle='rgba(225,229,255,.6)';ctx.fillText('GET READY',640,650);
    }
    const dur=Number(options.duration)||0;
    const progress=dur>0?Math.max(0,Math.min(1,time/dur)):0;
    ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(66,669,1148,2);
    ctx.fillStyle=options.highlight||'#c5b9ff';ctx.fillRect(66,669,1148*progress,2);
    ctx.restore();
  }
  window.LyraGalaxy = {draw,period:PERIOD};
})();
