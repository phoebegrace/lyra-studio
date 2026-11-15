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

function extractWords(result, offset, maxTime) {
  return (result.chunks || [])
    .filter(chunk => typeof chunk.text === 'string' && chunk.text.trim()
      && Array.isArray(chunk.timestamp) && Number.isFinite(chunk.timestamp[0]))
    .flatMap(chunk => {
      const text = chunk.text.trim();
      const start = offset + Math.max(0, Number(chunk.timestamp[0]));
      const end = offset + Math.min(maxTime, Number.isFinite(chunk.timestamp[1]) ? Number(chunk.timestamp[1]) : Number(chunk.timestamp[0]) + .28);
      // Whisper 'word' timestamps should produce individual tokens; retain timestamps as-is.
      return [{ text, start: Math.round(start * 100) / 100,
        end: Math.round(Math.max(end, start + .02) * 100) / 100 }];
    });
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
    const STEP = 24 * 16000; // Keep each chunk inside Whisper's 30s window.
    const count = Math.ceil(audio.length / STEP);
    const words = [];
    for (let i = 0; i < count; i++) {
      const begin = i * STEP, end = Math.min(audio.length, begin + STEP);
      status('Listening to vocal section ' + (i + 1) + ' of ' + count + '…',
        5 + Math.round(i / count * 90));
      const result = await transcriber(audio.subarray(begin, end), {
        return_timestamps: 'word',
        ...(model === 'tiny-multi' ? { task: 'transcribe', language: 'english' } : {}),
      });
      const section = extractWords(result, begin / 16000, (end - begin) / 16000);
      words.push(...section);
      status('Finished section ' + (i + 1) + ' of ' + count + '. Found ' + words.length + ' words…',
        5 + Math.round((i + 1) / count * 90));
    }
    if (!words.length) throw Error('No words detected. Please use the UVR vocals-only WAV instead of the instrumental.');
    self.postMessage({ words, percent: 100 });
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  }
};
