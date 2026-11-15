import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels = false;

const MODELS = Object.freeze({
  'tiny-en': 'onnx-community/whisper-tiny.en',
  'base-en': 'onnx-community/whisper-base.en',
  'tiny-multi': 'onnx-community/whisper-tiny',
});
let transcriber = null;
let lastModel = null;

function status(message, percent = null) {
  self.postMessage({ status: message, percent });
}

function extractWords(result, offset, segmentDuration, approximate = false) {
  const chunks = Array.isArray(result.chunks) && result.chunks.length
    ? result.chunks
    : [{text:result.text || '', timestamp:[0, segmentDuration]}];
  const words = [];
  for (const chunk of chunks) {
    const tokens = String(chunk.text || '').trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const pair = Array.isArray(chunk.timestamp) ? chunk.timestamp : [0, segmentDuration];
    const from = Math.max(0, Math.min(segmentDuration, Number(pair[0]) || 0));
    const rawEnd = Number(pair[1]);
    const to = Math.max(from + .12, Math.min(segmentDuration,
      Number.isFinite(rawEnd) ? rawEnd : segmentDuration));
    // Segment timestamps are available in standard ONNX Whisper models.
    // They do not include cross-attention outputs needed for exact word timestamps.
    // Distribute the words within a segment, weighting by word length.
    const weights = tokens.map(word => Math.max(2, word.replace(/[^a-z0-9]/gi,'').length));
    const weightTotal = weights.reduce((sum,w) => sum+w,0);
    let elapsedWeight = 0;
    for(let j=0;j<tokens.length;j++){
      const start = from+(to-from)*elapsedWeight/weightTotal;
      elapsedWeight += weights[j];
      const end = from+(to-from)*elapsedWeight/weightTotal;
      words.push({
        text:tokens[j],
        start:Math.round((offset+start)*100)/100,
        end:Math.round((offset+Math.max(start+.02,end))*100)/100
      });
    }
  }
  return words;
}
function missingAttention(error) {
  const message=String(error?.message||error).toLowerCase();
  return message.includes('cross attention')||message.includes('output_attentions')
    ||message.includes('extract timestamps');
}

self.onmessage = async (event) => {
  const { audio, model = 'tiny-en' } = event.data || {};
  try {
    if (!(audio instanceof Float32Array) || !audio.length) {
      throw Error('The browser did not provide valid decoded audio.');
    }
    if (!MODELS[model]) throw Error('Unknown speech-recognition model.');
    status('Preparing local Whisper model. The first run downloads files; later runs may use your browser cache…', 1);
    if (!transcriber || lastModel !== model) {
      transcriber = null;
      lastModel = null;
      transcriber = await pipeline('automatic-speech-recognition', MODELS[model], {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: event => {
          if (event.status === 'progress' && Number.isFinite(event.progress)) {
            status('Downloading speech model: ' + Math.round(event.progress) + '%', 1);
          } else if (event.status === 'initiate') {
            status('Loading ' + (event.file || 'AI speech model') + '…', 1);
          }
        },
      });
      lastModel = model;
    }
    const STEP = 12 * 16000; // Smaller sections improve approximate timing of sung phrases.
    let timingMode = 'word';
    let approximate = false;
    const count = Math.ceil(audio.length / STEP);
    const words = [];
    for (let i = 0; i < count; i++) {
      const begin = i * STEP, end = Math.min(audio.length, begin + STEP);
      status('Listening to vocal section ' + (i + 1) + ' of ' + count + '…',
        5 + Math.round(i / count * 90));
      let result;
      const settings = model === 'tiny-multi' ? { task: 'transcribe', language: 'english' } : {};
      try {
        result = await transcriber(audio.subarray(begin, end), {
          return_timestamps: timingMode === 'word' ? 'word' : true,
          ...settings
        });
      } catch (error) {
        if (timingMode !== 'word' || !missingAttention(error)) throw error;
        timingMode = 'segment';
        approximate = true;
        status('This Whisper model lacks word-level timestamps. Switching to supported phrase timing…',
          5 + Math.round(i/count*90));
        result = await transcriber(audio.subarray(begin, end), {
          return_timestamps: true, ...settings
        });
      }
      const section = extractWords(result, begin / 16000, (end - begin) / 16000, approximate);
      words.push(...section);
      status('Finished section ' + (i + 1) + ' of ' + count + '. Found ' + words.length + ' words…',
        5 + Math.round((i + 1) / count * 90));
    }
    if (!words.length) throw Error('No words detected. Please use the UVR vocals-only WAV instead of the instrumental.');
    self.postMessage({ words, approximate, percent: 100 });
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  }
};
