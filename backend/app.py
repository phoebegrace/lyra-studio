"""Single-user Lyra Studio local audio separation server."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("LYRA_OUTPUT_DIR", str(ROOT / "outputs")))
OUT.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Lyra Studio")
MAX_BYTES = 100 * 1024 * 1024
ALLOWED_MODELS = {"htdemucs", "htdemucs_ft"}


@app.post("/api/separate")
async def separate(file: UploadFile = File(...), model: str = Form("htdemucs")):
    if model not in ALLOWED_MODELS:
        raise HTTPException(400, "Unsupported separation model")
    suffix = Path(file.filename or "audio.wav").suffix.lower()
    if suffix not in {".wav", ".mp3", ".m4a", ".flac", ".ogg"}:
        raise HTTPException(400, "Unsupported audio format")
    job = uuid.uuid4().hex
    folder = OUT / job
    folder.mkdir()
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / ("song" + suffix)
        total = 0
        with source.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    shutil.rmtree(folder, ignore_errors=True)
                    raise HTTPException(413, "File exceeds 100 MB")
                target.write(chunk)
        cmd = [sys.executable, "-m", "demucs", "-n", model, "--two-stems=vocals", "--out", str(folder), str(source)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, check=False)
        except (FileNotFoundError, subprocess.TimeoutExpired) as error:
            shutil.rmtree(folder, ignore_errors=True)
            raise HTTPException(503, f"Separation engine unavailable: {error}")
        if result.returncode:
            shutil.rmtree(folder, ignore_errors=True)
            raise HTTPException(500, "Demucs failed: " + result.stderr[-700:])
    stems = folder / model / "song"
    if not stems.exists():
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(500, "No separated stems were produced")
    return {"job": job, "files": {key: f"/api/download/{job}/{key}" for key in ("vocals", "no_vocals")}}


@app.get("/api/download/{job}/{stem}")
def download(job: str, stem: str):
    if len(job) != 32 or any(ch not in "0123456789abcdef" for ch in job) or stem not in {"vocals", "no_vocals"}:
        raise HTTPException(400, "Invalid download")
    for model in ALLOWED_MODELS:
        path = OUT / job / model / "song" / (stem + ".wav")
        if path.is_file():
            return FileResponse(path, media_type="audio/wav", filename=stem + ".wav")
    raise HTTPException(404, "Stem not found")


app.mount("/", StaticFiles(directory=str(ROOT / "frontend"), html=True), name="frontend")
