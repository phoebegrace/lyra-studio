import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowLocalModels = false;
let transcriber;
self.onmessage = async (event) => {
  const { audio } = event.data || {};
  try {
    self.postMessage({ status: 'Loading the speech model (first run downloads model files)…' });
    transcriber ||= await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { device: 'wasm', dtype: 'q8' });
    self.postMessage({ status: 'Listening and estimating word timestamps…' });
    const result = await transcriber(audio, {
      return_timestamps: 'word',
      chunk_length_s: 20,
      stride_length_s: 4,
    });
    const words = (result.chunks || [])
      .filter(x => x.text?.trim() && Array.isArray(x.timestamp) && Number.isFinite(x.timestamp[0]))
      .map(x => ({ text: x.text.trim(), start: x.timestamp[0], end: x.timestamp[1] ?? x.timestamp[0] + 0.25 }));
    self.postMessage({ words, transcript: result.text || '' });
  } catch (e) {
    self.postMessage({ error: String(e?.message || e) });
  }
};
