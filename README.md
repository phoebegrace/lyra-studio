# Lyrica Studio

Personal karaoke workspace for syncing lyrics and creating karaoke videos.

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

## Align your own lyrics (SRT / LRC)

1. Upload the original song with vocals in **Studio** (the instrumental alone cannot provide word timing).
2. Open **Lyric Video**, import `.srt` or `.lrc`, or paste plain lyrics.
3. Click **Align supplied lyrics**. Whisper Tiny estimates vocal word timestamps in the browser, while an order-preserving word matcher retains your supplied words, punctuation and line breaks.
4. Preview the result, use **Timing shift** if the entire song needs an offset, and download `.srt` or `.lrc`.

This is heuristic word matching, **not precise forced alignment**. Missing and misheard words are interpolated, and repeated choruses can be misaligned. Check the preview before final export. When you manually edit LRC and press **Apply lyrics**, per-word precision falls back to approximate timing until you realign.


## Cloud separation (Vercel + Railway)

The Vercel deployment serves only the browser UI. The dedicated **Lyrica Studio Audio**
Railway service exposes the protected separation API:
`https://lyra-audio-worker-production.up.railway.app`.

The separation UI asks for a private processing key. In Railway, open **Lyra Studio
Audio → lyra-audio-worker → Variables** and find `LYRA_API_KEY`. Enter its value
in the browser's **Separate Audio** tab. **Never commit or share this value.**
The browser uses the key in request headers; it is not written to GitHub.

Default separation: **instrumental_clean** Audio Separator ensemble. Other presets
allow preserving fullness, vocal isolation, Kim Vocal or Demucs comparisons.
Exports are uncompressed WAV files; source fidelity and model artifacts still
affect the result.

Railway deployment has a dedicated `/backend` project root, and runs:
`uvicorn app:app --host 0.0.0.0 --port $PORT`.
It requires CPU RAM and storage for large model weights, Python 3.11, FFmpeg and
the dependencies in `backend/requirements.txt`. Model downloads happen on demand,
and the first separation can take a long time. Railway's normal CPU service
may lack sufficient memory for larger ensembles; GPU hosting is preferable for
high-speed reliable RoFormer separation.

The API uses a bearer key, serializes processing requests, caps uploads at 100 MB,
and restricts browser CORS origins. It remains a **personal-use prototype**;
do not expose your key or distribute the endpoint. There is currently no job
queue, progress polling, automatic cleanup, durable storage, or usage quota.
Railway resources may incur costs even when idle. Files are stored on an ephemeral
filesystem and can disappear on redeployment.
