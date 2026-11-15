// Browser-side CTC forced alignment of supplied English lyric lines.
// Uses a real wav2vec2 acoustic model. Never invents timestamps from syllable counts.
import { AutoProcessor, AutoTokenizer, AutoModelForCTC, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels = false;
const MODEL = 'Xenova/wav2vec2-base-960h';
const emit = (status, percent) => self.postMessage({status,percent});
const normalized = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z' ]/g,' ').replace(/\s+/g,' ').trim();
let processor, tokenizer, model;

async function load() {
  if(processor && tokenizer && model)return;
  emit('Downloading the forced-alignment acoustic model. This happens once per browser cache.',2);
  [processor, tokenizer] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL),
    AutoTokenizer.from_pretrained(MODEL),
  ]);
  model = await AutoModelForCTC.from_pretrained(MODEL,{
    device:'wasm',dtype:'q8',progress_callback:p=>{
      if(p.status==='progress' && Number.isFinite(p.progress))
        emit('Loading alignment model: '+Math.round(p.progress)+'%',3);
    }
  });
}

function alignmentPath(frames, ids, blank) {
  const T=frames.length, K=ids.length, S=2*K+1, bad=-1e16;
  if(T<K+4)throw Error('Audio is too short for the number of lyric characters.');
  if(T*S>9e7)throw Error('These lyrics are too long for browser alignment. Try splitting the song into parts.');
  const old=new Float32Array(S),now=new Float32Array(S),trace=new Uint8Array(T*S);
  old.fill(bad);old[0]=0;
  for(let t=0;t<T;t++){
    const row=frames[t],base=t*S;
    let max=Number.NEGATIVE_INFINITY;
    for(let k=0;k<row.length;k++)if(row[k]>max)max=row[k];
    now.fill(bad);
    const minS=Math.max(0,S-2*(T-t)),maxS=Math.min(S-1,2*t+1);
    for(let s=minS;s<=maxS;s++){
      const id=s%2===0?blank:ids[(s-1)>>1];
      let best=old[s],step=0;
      if(s>=1&&old[s-1]>best){best=old[s-1];step=1}
      if(s>=2&&s%2===1&&ids[(s-1)>>1]!==ids[((s-1)>>1)-1]&&old[s-2]>best){
        best=old[s-2];step=2;
      }
      if(best<=bad/2)continue;
      now[s]=best+(row[id]-max);
      trace[base+s]=step;
    }
    old.set(now);
    if(t%500===0&&t>0)emit('Aligning lyrics to vocal phonemes…',82+Math.round(14*t/T));
  }
  let state=old[S-1]>old[S-2]?S-1:S-2;
  if(old[state]<=bad/2)throw Error('Could not align the lyrics to this audio.');
  const first=new Int32Array(K).fill(-1),last=new Int32Array(K).fill(-1),margin=new Float32Array(K);
  const counts=new Uint32Array(K);
  for(let t=T-1;t>=0;t--){
    if(state%2===1){
      const k=(state-1)>>1;
      first[k]=t;if(last[k]<0)last[k]=t;
      const row=frames[t];let top=-Infinity;for(let n=0;n<row.length;n++)top=Math.max(top,row[n]);
      margin[k]+=row[ids[k]]-top;counts[k]++;
    }
    state-=trace[t*S+state];
    if(state<0)throw Error('An invalid alignment path was returned.');
  }
  return {first,last,margin,counts};
}

self.onmessage = async event=>{
  try{
    const {audio,cues} = event.data||{};
    if(!(audio instanceof Float32Array)||!audio.length||!Array.isArray(cues)||!cues.length)
      throw Error('Add a vocals WAV and paste lyric lines first.');
    const textLines=cues.map(x=>normalized(x.text)).filter(Boolean);
    if(textLines.length!==cues.length)
      throw Error('Use English lyric lines for this alignment model; one or more lines had no supported words.');
    await load();
    const all=textLines.join(' ');
    const ids=Array.from(tokenizer.encode(all,{add_special_tokens:false}));
    const blank=Number(tokenizer.pad_token_id ?? model.config?.pad_token_id ?? 0);
    if(!ids.length||ids.some(x=>x===blank))throw Error('The supplied lyric characters cannot be represented by this model.');
    // Map each reference WORD (not just each line) into the CTC token sequence.
    // Wav2Vec2 uses character tokens; prefix token lengths let us retain exact
    // token boundaries even if its tokenizer normalizes spaces differently.
    const lexical=[];
    const wordRegex=/[^ ]+/g;
    for(let match; (match=wordRegex.exec(all))!==null;){
      const before=all.slice(0,match.index);
      const through=all.slice(0,match.index+match[0].length);
      const start=tokenizer.encode(before,{add_special_tokens:false}).length;
      const end=tokenizer.encode(through,{add_special_tokens:false}).length-1;
      lexical.push({text:match[0],start,end});
    }
    if(!lexical.length||lexical.some(w=>w.start>w.end||w.start<0||w.end>=ids.length))
      throw Error('Unable to map lyric words to alignment tokens.');
    let wordCursor=0;
    const bounds=textLines.map(line=>{
      const numWords=line.split(' ').filter(Boolean).length;
      const start=wordCursor;
      wordCursor+=numWords;
      return {start,end:wordCursor};
    });
    if(wordCursor!==lexical.length)throw Error('Lyric word tokenization mismatch.');
    emit('Reading the vocals with Wav2Vec2…',5);
    const size=8*16000,frames=[],timesStart=[],timesEnd=[];
    const parts=Math.ceil(audio.length/size);
    for(let i=0;i<parts;i++){
      const start=i*size,end=Math.min(audio.length,start+size);
      const chunk=audio.subarray(start,end);
      const inputs=await processor(chunk);
      const result=await model(inputs);
      const logits=result.logits;
      if(!logits||logits.dims?.length!==3)throw Error('Model returned an unsupported acoustic output.');
      const T=logits.dims[1],V=logits.dims[2];
      if(ids.some(id=>id>=V||id<0)||blank>=V)throw Error('The model vocabulary does not match the supplied lyrics.');
      for(let t=0;t<T;t++){
        frames.push(logits.data.subarray(t*V,(t+1)*V).slice());
        timesStart.push(start/16000+(t/T)*chunk.length/16000);
        timesEnd.push(start/16000+((t+1)/T)*chunk.length/16000);
      }
      emit('Analyzed vocal section '+(i+1)+' of '+parts+'…',5+Math.round(75*(i+1)/parts));
    }
    const path=alignmentPath(frames,ids,blank);
    const detectedWords=lexical.map(lex=>{
      let a=-1,b=-1,score=0,seen=0;
      for(let k=lex.start;k<=lex.end;k++){
        if(path.first[k]>=0&&(a<0||path.first[k]<a))a=path.first[k];
        if(path.last[k]>b)b=path.last[k];
        if(path.counts[k]){score+=path.margin[k]/path.counts[k];seen++}
      }
      if(a<0||b<0)return {start:null,end:null,confidence:0};
      const confidence=Math.max(0,Math.min(1,Math.exp((score/Math.max(1,seen))/2)));
      return {start:Math.round(timesStart[a]*1000)/1000,
        end:Math.round(Math.max(timesEnd[b],timesStart[a]+.06)*1000)/1000,
        confidence};
    });
    const aligned=cues.map((cue,i)=>{
      const {start,end}=bounds[i];
      const sourceWords=cue.text.trim().split(/\s+/).filter(Boolean);
      const alignedWords=detectedWords.slice(start,end);
      // Keep original punctuation/casing in the on-screen lyrics.
      const words=alignedWords.map((w,j)=>({text:sourceWords[j]||lexical[start+j].text,...w}));
      if(words.length!==sourceWords.length || words.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)))
        return {text:cue.text,t:null,end:null,words:[],confidence:0,uncertain:true};
      let confidence=words.reduce((v,w)=>v+w.confidence,0)/words.length;
      const t=words[0].start,last=words[words.length-1].end;
      const duration=last-t;
      // Check suspicious whole-line results instead of declaring them precise.
      const uncertain=confidence<.24||duration<.12||words.some(w=>w.end<=w.start);
      return {text:cue.text,t,end:Math.max(last,t+.15),words,confidence,uncertain};
    });
    const uncertain=aligned.filter(x=>x.uncertain).length;
    self.postMessage({lines:aligned,uncertain,percent:100,
      method:'Wav2Vec2 CTC forced alignment',language:'en'});
  }catch(e){self.postMessage({error:String(e?.message||e)})}
};