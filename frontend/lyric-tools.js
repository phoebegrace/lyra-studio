/* Lyra Studio: lyric import and best-effort Whisper-to-reference alignment.
   Browser-safe: no third-party APIs or audio upload. */
const normalize = s => (s || '').normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9']/g, '').replace(/'/g, '');
const sec = value => {
  const m = String(value).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] || '0').padEnd(3, '0')) / 1000;
};
const cleanText = s => s.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
export function parseLyricDocument(text, filename = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const isSrt = /\.srt$/i.test(filename) || /\d\d:\d\d:\d\d[,.]\d+\s*-->/.test(raw);
  let lines = [];
  if (isSrt) {
    for (const block of raw.split(/\n\s*\n/)) {
      const rows = block.split('\n').map(x => x.trim()).filter(Boolean);
      const at = rows.findIndex(x => x.includes('-->'));
      if (at < 0) continue;
      const times = rows[at].split('-->');
      const t = sec(times[0]);
      const end = sec(times[1].trim().split(/\s/)[0]);
      const lyric = cleanText(rows.slice(at + 1).join(' ').trim());
      if (t !== null && lyric) lines.push({ t, end: end ?? undefined, text: lyric });
    }
  } else if (/^\s*\[\d{1,2}:\d{2}/m.test(raw)) {
    for (const row of raw.split('\n')) {
      const m = row.match(/^\s*\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\](.*)$/);
      if (m) {
        const t = sec('00:' + m[1]);
        const lyric = cleanText(m[2]);
        if (t !== null && lyric) lines.push({ t, text: lyric });
      }
    }
  } else {
    for (const row of raw.split('\n')) {
      const lyric = cleanText(row);
      if (lyric && !/^\[?(?:verse|chorus|bridge|outro|intro|pre.chorus|instrumental|hook)(?:[^\]]*)\]?$/i.test(lyric)) {
        lines.push({ t: null, text: lyric });
      }
    }
  }
  return lines.sort((a,b) => (a.t ?? Infinity) - (b.t ?? Infinity));
}
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const previous = Array.from({ length: b.length + 1 }, (_,i) => i);
  for (let i=1; i<=a.length; i++) {
    let left = i, diag = i-1;
    for (let j=1; j<=b.length; j++) {
      const old = previous[j];
      const next = Math.min(old+1, left+1, diag+(a[i-1]===b[j-1]?0:1));
      previous[j] = next; left = next; diag = old;
    }
  }
  return previous[b.length];
};
const score = (a,b) => a === b ? 4 : (a.length >= 4 && b.length >= 4 && editDistance(a,b)<=1 ? 1.8 : -2.5);
export function alignLyricsToWords(referenceLines, transcriptWords, duration = 0) {
  const tokens = [];
  for (let i=0; i<referenceLines.length; i++)
    for (const value of referenceLines[i].text.split(/\s+/).filter(Boolean))
      tokens.push({ text:value, norm:normalize(value), line:i, hint:referenceLines[i].t });
  const heard = transcriptWords.filter(w => normalize(w.text) && Number.isFinite(w.start))
    .map(w => ({ ...w, norm:normalize(w.text) }));
  if (!tokens.length || !heard.length) throw Error('Add lyrics and a detected vocal track first.');
  if (tokens.length > 1400 || heard.length > 1800) throw Error('Song too long for browser alignment. Try a shorter recording.');
  const n=tokens.length, m=heard.length, width=m+1, dp=new Float32Array((n+1)*width), back=new Uint8Array((n+1)*width);
  const penalty = -0.75, skipReference=-1.25;
  for(let i=1;i<=n;i++){dp[i*width]=i*skipReference;back[i*width]=1;}
  for(let j=1;j<=m;j++){dp[j]=j*penalty;back[j]=2;}
  for(let i=1;i<=n;i++) for(let j=1;j<=m;j++){
    const target=tokens[i-1], observed=heard[j-1];
    const hintPenalty=target.hint != null ? Math.min(3,Math.abs(target.hint-observed.start)/12)*0.3 : 0;
    const diagonal=dp[(i-1)*width+j-1]+score(target.norm,observed.norm)-hintPenalty;
    const up=dp[(i-1)*width+j]+skipReference, left=dp[i*width+j-1]+penalty;
    const p=i*width+j;
    if(diagonal>=up && diagonal>=left){dp[p]=diagonal;back[p]=0;}
    else if(up>=left){dp[p]=up;back[p]=1;}
    else {dp[p]=left;back[p]=2;}
  }
  const matched=Array(n).fill(null);let i=n,j=m,matchedCount=0;
  while(i>0||j>0){
    const direction=back[i*width+j];
    if(i>0&&j>0&&direction===0){
      if(score(tokens[i-1].norm,heard[j-1].norm)>0) {matched[i-1]=heard[j-1].start;matchedCount++;}
      i--;j--;
    } else if(i>0&&(j===0||direction===1)) i--;
    else j--;
  }
  if(matchedCount<Math.min(3,n) || matchedCount/n<0.2)
    throw Error('Could not reliably match the supplied lyrics to the detected vocals. Check the song and try again.');
  const starts=matched.slice(), validDuration=Math.max(duration||0,heard.at(-1).end||heard.at(-1).start,heard.at(-1).start+1);
  const anchors=[];
  for(let k=0;k<n;k++) if(Number.isFinite(starts[k])) anchors.push(k);
  for(let k=0;k<n;k++){
    if(Number.isFinite(starts[k]))continue;
    let lo=-1,hi=n;
    for(let a=anchors.length-1;a>=0;a--)if(anchors[a]<k){lo=anchors[a];break;}
    for(let a=0;a<anchors.length;a++)if(anchors[a]>k){hi=anchors[a];break;}
    let estimate;
    if(lo>=0&&hi<n) estimate=starts[lo]+(starts[hi]-starts[lo])*(k-lo)/(hi-lo);
    else if(lo>=0) estimate=starts[lo]+0.3*(k-lo);
    else if(hi<n) estimate=Math.max(0,starts[hi]-0.3*(hi-k));
    else estimate=0;
    starts[k]=Math.min(validDuration,Math.max(0,estimate));
  }
  for(let k=1;k<n;k++) starts[k]=Math.max(starts[k],starts[k-1]);
  let pos=0;
  const lines=referenceLines.map((line) => {
    const words=line.text.split(/\s+/).filter(Boolean).map(value=>({text:value,start:starts[pos++]}));
    return { text:line.text, t: words[0]?.start ?? line.t ?? 0, end:line.end, words };
  });
  return { lines, matchRate: matchedCount/n, matches:matchedCount, total:n };
}
export function formatLrc(lines) {
  const stamp=t=>'['+String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+String(Math.floor((t%1)*100)).padStart(2,'0')+']';
  return lines.map(l=>stamp(l.t||0)+l.text).join('\n');
}
export function formatSrt(lines, duration) {
  const stamp=t=>{const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=Math.floor(t%60),ms=Math.floor((t%1)*1000);return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms).padStart(3,'0')};
  return lines.map((line,i)=> {
    const end=Math.max(line.t+0.2,Math.min(duration||Infinity,lines[i+1]?.t??line.end??line.t+3));
    return (i+1)+'\n'+stamp(line.t)+' --> '+stamp(end)+'\n'+line.text;
  }).join('\n\n');
}
