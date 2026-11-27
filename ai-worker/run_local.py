"""Private local worker; reads only this project's server environment file."""
from pathlib import Path
import os
import secrets

ROOT = Path(__file__).resolve().parents[1]

def configure():
    target = ROOT / ".env.local"
    content = target.read_text(encoding="utf-8") if target.exists() else "APP_MODE=demo\nAPP_URL=http://127.0.0.1:3050\n"
    for key, value in {"AI_WORKER_URL":"http://127.0.0.1:8000", "AI_WORKER_TOKEN":secrets.token_urlsafe(36)}.items():
        if not any(line.startswith(key+"=") and line.split("=",1)[1].strip() for line in content.splitlines()):
            content += f"\n{key}={value}\n"
    target.write_text(content, encoding="utf-8")
    for line in content.splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=",1)
            if key in ("AI_WORKER_URL", "AI_WORKER_TOKEN"):
                os.environ[key] = value.strip().strip('"').strip("'")
    if len(os.environ.get("AI_WORKER_TOKEN", "")) < 24:
        raise RuntimeError("AI_WORKER_TOKEN must be at least 24 characters")

if __name__ == "__main__":
    configure()
    os.environ["ENABLE_LOCAL_MODELS"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    import torch
    torch.set_num_threads(4)
    import uvicorn
    print("Rupa local AI worker: " + ("CUDA GPU" if torch.cuda.is_available() else "CPU; previews take longer"), flush=True)
    uvicorn.run("server:app", host="127.0.0.1", port=8000, log_level="info")
