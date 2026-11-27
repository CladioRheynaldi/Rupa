"""Pinned local inpainting weights, resumable download and SHA256 validation."""
from pathlib import Path
import hashlib
import json
import shutil
import httpx
from download_models import ROOT, download

REPO = "stable-diffusion-v1-5/stable-diffusion-inpainting"
REVISION = "8a4288a76071f7280aedbdb3253bdb9e9d5d84bb"

def main():
    response = httpx.get(f"https://huggingface.co/api/models/{REPO}/revision/{REVISION}?blobs=true", timeout=90)
    response.raise_for_status()
    records = []
    for entry in response.json()["siblings"]:
        name = entry["rfilename"]
        if not (name.endswith((".json", ".txt", ".fp16.safetensors")) or name.lower() in ("readme.md", "license", "license.txt")):
            continue
        target = ROOT / "inpaint" / name
        expected = entry.get("lfs", {}).get("sha256")
        # Reuse only byte-identical existing components, verified against upstream.
        old = ROOT / "preview" / name
        if expected and not target.exists() and old.exists() and hashlib.file_digest(old.open("rb"), "sha256").hexdigest() == expected:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(old, target)
            print("Reused verified component:", name, flush=True)
        download((REPO, REVISION, "inpaint", name))
        if expected:
            with target.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise RuntimeError(f"Checksum mismatch: {name}; remove this file and retry")
            records.append({"file": name, "sha256": actual})
    (ROOT / "inpaint" / "download-manifest.json").write_text(json.dumps({"repo":REPO,"revision":REVISION,"verified":records}, indent=2), encoding="utf-8")
    print("Inpainting weights downloaded and verified.", flush=True)

if __name__ == "__main__":
    main()
