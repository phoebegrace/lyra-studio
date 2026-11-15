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
    const bounds=textLines.map((line,i)=>{
      const before=textLines.slice(0,i).join(' ');
      const start=i===0?0:tokenizer.encode(before+' ',{add_special_tokens:false}).length;
      const end=tokenizer.encode(textLines.slice(0,i+1).join(' '),{add_special_tokens:false}).length-1;
      return {start,end};
    });
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
    const aligned=cues.map((cue,i)=>{
      const {start,end}=bounds[i];
      let a=-1,b=-1,quality=0,count=0;
      for(let k=start;k<=end;k++){
        if(path.first[k]>=0&&(a<0||path.first[k]<a))a=path.first[k];
        if(path.last[k]>b)b=path.last[k];
        if(path.counts[k]){quality+=path.margin[k]/path.counts[k];count++}
      }
      if(a<0||b<0)return {...cue,t:null,confidence:0,uncertain:true};
      const confidence=Math.max(0,Math.min(1,Math.exp((quality/Math.max(1,count))/2)));
      return {text:cue.text,t:Math.round(timesStart[a]*100)/100,
        end:Math.round(Math.max(timesEnd[b],timesStart[a]+.2)*100)/100,
        confidence,uncertain:confidence<.24};
    });
    const uncertain=aligned.filter(x=>x.uncertain).length;
    self.postMessage({lines:aligned,uncertain,percent:100,
      method:'Wav2Vec2 CTC forced alignment',language:'en'});
  }catch(e){self.postMessage({error:String(e?.message||e)})}
};