# Lyra Studio

Personal karaoke workspace with a clean Lunatik Hub-inspired interface.

## Features

- Upload and play audio locally in the browser.
- Separate vocals and instrumentals using the Demucs 4 two-stem model.
- Automatically transcribe uploaded vocals into word-level timestamps in the browser with a Whisper Tiny model, or paste timed LRC lines.
- Customize karaoke canvas colors and export a real-time WebM video in a compatible browser.

## Run locally

Requirements: Python 3.10 or 3.11, FFmpeg installed and available on PATH, and a working PyTorch/Demucs installation.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8000
```

Visit http://localhost:8000 in Chrome. For WebM audio export, browser capture support varies.

## How to use

1. Open Studio and select a song.
2. Open Separate Audio to produce downloadable WAV stems (optional).
3. To create a karaoke video with the instrumental, upload the downloaded instrumental as the new song.
4. Open Lyric Video and click **Generate timed lyrics** to run browser-side AI transcription, or paste LRC lines like `[00:03.20]First line of lyrics`.
5. Apply lyrics and customize the karaoke colors.
6. Export WebM in real time; keep the page open until the song ends.

## Important MVP limitations

- This is a local, single-user prototype and is **not safe to host publicly** without authentication, server job queues, storage cleanup, and resource quotas.
- Audio separation may take minutes and may not be perfect. On Apple Silicon, processing speed depends on local PyTorch support.
- Automatic transcription with Whisper Tiny is experimental and may produce incorrect words or timings for singing, harmonies or noisy recordings. It downloads a model on first use and can be slow on laptops. When LRC text is edited and applied, timing falls back to approximate per-line highlighting.
- Audio never needs to leave the browser for timing, though model files are downloaded from Hugging Face. Video export is WebM, not MP4, and browser support varies. The exporter is experimental; test with short clips first.
- The browser audio-export code is experimental, so audio recording behavior can vary by browser and repeated exports may require reloading the page.
- Do not upload music or lyrics unless you have appropriate rights to use them.
