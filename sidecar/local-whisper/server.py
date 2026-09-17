#!/usr/bin/env python3
"""BirdCut Local Whisper sidecar.

OpenAI-compatible POST /v1/audio/transcriptions (verbose_json + word timestamps)
and GET /health for the Premiere UXP panel.

Premiere cannot run Whisper in-process. Start this on the Mac, then BirdCut
Settings → Local Whisper (on this Mac) → Transcribe sequence.
"""
from __future__ import annotations

import os
import sys
import tempfile
import traceback

from flask import Flask, jsonify, request

HOST = os.environ.get("BIRDCUT_WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("BIRDCUT_WHISPER_PORT", "8090"))
MODEL_NAME = os.environ.get("BIRDCUT_WHISPER_MODEL", "base")
DEVICE = os.environ.get("BIRDCUT_WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("BIRDCUT_WHISPER_COMPUTE", "int8")

app = Flask(__name__)
_model = None
_load_error = None


def load_model():
    global _model, _load_error
    if _model is not None:
        return _model
    if _load_error is not None:
        raise _load_error
    try:
        from faster_whisper import WhisperModel

        print(f"Loading faster-whisper model {MODEL_NAME!r} ({DEVICE}/{COMPUTE_TYPE})…", flush=True)
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        print("Model ready.", flush=True)
        return _model
    except Exception as err:  # pragma: no cover - depends on local ML stack
        _load_error = err
        raise


def normalize_language(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    return raw.replace("_", "-").split("-")[0].lower() or None


def to_verbose_json(segments, info):
    segment_rows = []
    words = []
    texts = []
    for segment in segments:
        texts.append(segment.text or "")
        word_rows = []
        for word in getattr(segment, "words", None) or []:
            row = {
                "word": (word.word or "").strip() or (word.word or ""),
                "start": float(word.start or 0),
                "end": float(word.end or 0),
            }
            word_rows.append(row)
            words.append(row)
        segment_rows.append(
            {
                "id": int(getattr(segment, "id", len(segment_rows))),
                "start": float(segment.start or 0),
                "end": float(segment.end or 0),
                "text": segment.text or "",
                "words": word_rows,
            }
        )
    duration = getattr(info, "duration", None)
    if duration is None and segment_rows:
        duration = segment_rows[-1]["end"]
    return {
        "task": "transcribe",
        "language": getattr(info, "language", None) or "en",
        "duration": float(duration or 0),
        "text": "".join(texts).strip(),
        "words": words,
        "segments": segment_rows,
    }


def health_payload():
    return {
        "ok": _model is not None,
        "ready": _model is not None,
        "engine": "faster-whisper",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.get("/")
@app.get("/health")
@app.get("/v1/health")
def health():
    body = health_payload()
    body["ok"] = True
    body["message"] = (
        "Local Whisper sidecar is running."
        if _model is not None
        else "Local Whisper sidecar is starting (model not loaded yet)."
    )
    return jsonify(body)


@app.post("/v1/audio/transcriptions")
@app.post("/audio/transcriptions")
def transcribe():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"error": {"message": "Missing file field (multipart name=file)."}}), 400
    language = normalize_language(request.form.get("language") or request.args.get("language"))
    model_name = (request.form.get("model") or MODEL_NAME).strip() or MODEL_NAME
    suffix = os.path.splitext(upload.filename)[1] or ".mp3"
    tmp_path = None
    try:
        model = load_model()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            upload.save(handle.name)
            tmp_path = handle.name
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,
        )
        payload = to_verbose_json(list(segments), info)
        if model_name:
            payload["model"] = model_name
        return jsonify(payload)
    except Exception as err:
        traceback.print_exc()
        message = str(err) or err.__class__.__name__
        if "ffmpeg" in message.lower() or "av." in message.lower() or "No such file" in message:
            message = (
                f"{message} — install ffmpeg (brew install ffmpeg) so the sidecar can decode MP3/WAV."
            )
        return jsonify({"error": {"message": message}}), 500
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def main():
    print(f"BirdCut Local Whisper sidecar → http://{HOST}:{PORT}", flush=True)
    print("GET  /health", flush=True)
    print("POST /v1/audio/transcriptions  (verbose_json + word timestamps)", flush=True)
    try:
        load_model()
    except Exception as err:
        print(f"WARNING: model not loaded yet ({err}). First POST will retry.", file=sys.stderr, flush=True)
    app.run(host=HOST, port=PORT, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
