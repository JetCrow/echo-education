"""Local OmniVoice + Rhubarb adapter for ECHO. No OpenAI key or conversation storage."""
import argparse
import asyncio
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
import soundfile as sf
import uvicorn


def create_app(synthesize, rhubarb):
    app = FastAPI()
    jobs, cancelled = {}, {}
    gpu_lock = threading.Lock()

    @app.get('/health')
    async def health():
        return {'ready': True}

    @app.post('/cancel/{job_id}')
    async def cancel(job_id: str):
        try:
            job_id = str(uuid.UUID(job_id))
        except ValueError:
            raise HTTPException(400, 'Invalid ID')
        now = time.monotonic()
        for key in list(cancelled):
            if cancelled[key] < now:
                cancelled.pop(key, None)
        if len(cancelled) < 1000:
            cancelled[job_id] = now + 120
        if job_id in jobs:
            jobs[job_id].set()
        return {'ok': True}

    def generate(text, event):
        with gpu_lock:
            if event.is_set():
                return None
            started = time.perf_counter()
            audio = synthesize(text)
            generation_ms = (time.perf_counter() - started) * 1000
        if event.is_set():
            return None
        wav = io.BytesIO()
        sf.write(wav, audio, 24000, format='WAV', subtype='PCM_16')
        started = time.perf_counter()
        with tempfile.TemporaryDirectory(prefix='echo-cues-') as folder:
            source, output = Path(folder) / 'speech.wav', Path(folder) / 'cues.json'
            source.write_bytes(wav.getvalue())
            process = subprocess.Popen([str(rhubarb), '-r', 'phonetic', '-f', 'json',
                '--extendedShapes', 'GX', '--threads', '4', '-o', str(output), str(source)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            try:
                deadline = time.monotonic() + 30
                while process.poll() is None:
                    if event.is_set():
                        return None
                    if time.monotonic() > deadline:
                        raise RuntimeError('Cue calculation timeout')
                    time.sleep(0.02)
                if process.returncode != 0:
                    raise RuntimeError('Cue calculation failed')
                cues = json.loads(output.read_text(encoding='utf-8'))['mouthCues']
                if not cues or any(c['value'] not in 'ABCDEFGX' for c in cues):
                    raise RuntimeError('Invalid cues')
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
        if event.is_set():
            return None
        return {'wav': base64.b64encode(wav.getvalue()).decode(), 'cues': cues,
                'generationMs': round(generation_ms, 2),
                'cueCalculationMs': round((time.perf_counter()-started)*1000, 2)}

    @app.post('/synthesize')
    async def speech(request: Request):
        try:
            data = await request.json()
            job_id = str(uuid.UUID(data.get('id', '')))
            text = data.get('text', '')
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(400, 'Invalid request')
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 6000:
            raise HTTPException(400, 'Invalid text')
        if cancelled.get(job_id, 0) > time.monotonic():
            raise HTTPException(409, 'Cancelled')
        if job_id in jobs or len(jobs) >= 4:
            raise HTTPException(429, 'Voice service busy')
        event = threading.Event()
        jobs[job_id] = event
        task = asyncio.create_task(asyncio.to_thread(generate, text.strip(), event))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.05)
                if await request.is_disconnected():
                    event.set()
            result = await task
            if event.is_set() or result is None:
                raise HTTPException(409, 'Cancelled')
            return result
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(500, 'Local voice generation failed')
        finally:
            event.set()
            jobs.pop(job_id, None)

    return app


def main():
    import torch
    from omnivoice import OmniVoice
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voice-dir', type=Path, default=Path.home() / 'alina-voice-test' / 'alina-lips-test')
    args = parser.parse_args()
    root = args.voice_dir.resolve()
    reference, rhubarb = root / 'alina-reference.wav', root / 'rhubarb' / 'rhubarb.exe'
    if not reference.is_file() or not rhubarb.is_file():
        parser.error('Voice directory must contain alina-reference.wav and rhubarb/rhubarb.exe')
    model = OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map='cuda:0', dtype=torch.float16)
    prompt = model.create_voice_clone_prompt(ref_audio=str(reference), ref_text='Привіт! Я Аліна. Давай разом розберемо твоє завдання. Не поспішай: спочатку розкажи, що вже зрозуміло, а я допоможу з наступним кроком.')

    def synthesize(text):
        torch.cuda.synchronize()
        result = model.generate(text=text, voice_clone_prompt=prompt, num_step=32)[0]
        torch.cuda.synchronize()
        return result

    synthesize('Привіт!')
    print('Alina voice ready at http://127.0.0.1:8006', flush=True)
    uvicorn.run(create_app(synthesize, rhubarb), host='127.0.0.1', port=8006, access_log=False)


if __name__ == '__main__':
    main()
