"""Lyra Studio local/worker separation API.

Not intended for public unauthenticated deployment. Requires a long-running
worker with sufficient CPU/GPU RAM and persistent model cache.
"""
from pathlib import Path
import os
import asyncio
import secrets
from threading import BoundedSemaphore
import re
import shutil
import subprocess
import tempfile
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.getenv("LYRA_OUTPUT_DIR", str(ROOT / "outputs")))
MODELS = Path(os.getenv("LYRA_MODEL_DIR", str(ROOT / "models_cache")))
OUT.mkdir(parents=True, exist_ok=True)
MODELS.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Lyra Studio separation backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://lyra-studio-ten.vercel.app", "http://localhost:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type"],
)
ACCESS_KEY = os.getenv("LYRA_API_KEY", "")
SEPARATION_LOCK = BoundedSemaphore(1)

def check_access(authorization: str | None):
    if not ACCESS_KEY:
        raise HTTPException(503, "The separation service needs a private access key.")
    provided = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(provided, ACCESS_KEY):
        raise HTTPException(401, "Invalid audio processing access key.")


# Server-side allowlist. Never execute a model identifier supplied by the user.
PRESETS = {
    "kim_vocal_2": ("model", "Kim_Vocal_2.onnx"),
    "kim_vocal_1": ("model", "Kim_Vocal_1.onnx"),
    "kim_inst": ("model", "Kim_Inst.onnx"),
    "uvr_inst_hq3": ("model", "UVR-MDX-NET-Inst_HQ_3.onnx"),
    "roformer_hq": ("model", "model_bs_roformer_ep_317_sdr_12.9755.ckpt"),
    "instrumental_clean": ("ensemble", "instrumental_clean"),
    "instrumental_balanced": ("ensemble", "instrumental_balanced"),
    "vocal_balanced": ("ensemble", "vocal_balanced"),
    "karaoke": ("ensemble", "karaoke"),
    "instrumental_full": ("ensemble", "instrumental_full"),
    "demucs_ft": ("demucs", "htdemucs_ft"),
}
MAX_BYTES = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
STEMS = {"vocals", "instrumental"}
SAFE_ID = re.compile(r"^[a-f0-9]{32}$")


@app.get("/api/health")
def health():
    """Advertise availability without claiming that model weights are installed."""
    return {"service": "lyra-stems", "status": "ready", "available_presets": list(PRESETS)}


def select_stems(folder: Path):
    """Find named audio stems without relying on model-specific full filenames."""
    sources = {}
    for item in sorted(folder.rglob("*.wav")):
        name = item.stem.lower()
        if "vocals" in name or "vocal" in name:
            label = "instrumental" if "no_vocals" in name or "no vocal" in name else "vocals"
        elif "instrumental" in name or "other" in name:
            label = "instrumental"
        else:
            continue
        if label in sources:
            continue
        sources[label] = item
    return sources


def run_engine(input_path: Path, result_path: Path, preset: str):
    engine, value = PRESETS[preset]
    if engine == "demucs":
        args = [
            "python", "-m", "demucs", "-n", value,
            "--two-stems=vocals", "--out", str(result_path), str(input_path),
        ]
    else:
        args = [
            "audio-separator", str(input_path),
            "--output_format=WAV",
            "--output_dir", str(result_path),
            "--model_file_dir", str(MODELS),
            "--sample_rate", "44100",
        ]
        if engine == "ensemble":
            args += ["--ensemble_preset", value]
        else:
            args += ["--model_filename", value]
    try:
        proc = subprocess.run(args, capture_output=True, text=True, check=False, timeout=3600)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Separation engine unavailable or timed out: " + str(error)) from error
    if proc.returncode:
        raise RuntimeError("Separation engine failed: " + (proc.stderr or proc.stdout)[-600:])
    return select_stems(result_path)


@app.post("/api/separate")
async def separate(file: UploadFile = File(...), model: str = Form("instrumental_clean"), authorization: str | None = Header(None)):
    check_access(authorization)
    if model not in PRESETS:
        raise HTTPException(400, "Unsupported separation preset")
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Supported formats are WAV, MP3, M4A, FLAC and OGG.")
    if not SEPARATION_LOCK.acquire(blocking=False):
        raise HTTPException(429, "An audio job is already running. Try again later.")
    job_id = uuid.uuid4().hex
    job_dir = OUT / job_id
    job_dir.mkdir(parents=True)
    try:
        with tempfile.TemporaryDirectory() as temp:
            incoming = Path(temp) / ("song" + extension)
            size = 0
            with incoming.open("wb") as target:
                while part := await file.read(1024 * 1024):
                    size += len(part)
                    if size > MAX_BYTES:
                        raise HTTPException(413, "Audio is larger than 100 MB.")
                    target.write(part)
            files = await asyncio.to_thread(run_engine, incoming, job_dir / "raw", model)
        if not STEMS.issubset(files):
            raise RuntimeError("The model did not produce both vocal and instrumental stems.")
        for key in STEMS:
            # Repack to consistent, uncompressed WAV filenames (no lossy encoding).
            destination = job_dir / (key + ".wav")
            shutil.move(str(files[key]), destination)
        shutil.rmtree(job_dir / "raw", ignore_errors=True)
        return {
            "job": job_id,
            "model": model,
            "format": "WAV",
            "files": {key: f"/api/download/{job_id}/{key}" for key in sorted(STEMS)},
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except RuntimeError as error:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(503, str(error)) from error
    finally:
        SEPARATION_LOCK.release()


@app.get("/api/download/{job}/{stem}")
def download(job: str, stem: str, authorization: str | None = Header(None)):
    check_access(authorization)
    if not SAFE_ID.fullmatch(job) or stem not in STEMS:
        raise HTTPException(400, "Invalid download request")
    path = OUT / job / (stem + ".wav")
    if not path.is_file():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(path, media_type="audio/wav", filename=stem + ".wav")


if (ROOT / "frontend").is_dir():
    app.mount("/", StaticFiles(directory=str(ROOT / "frontend"), html=True), name="frontend")
