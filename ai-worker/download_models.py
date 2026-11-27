"""Download only pinned safetensors/config assets, with resumable partial files."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import time
import httpx
import math

ROOT = Path(__file__).resolve().parents[1] / ".local" / "models"
MODELS = [
    ("Qwen/Qwen3.5-0.8B", "2fc06364715b967f1860aea9cf38778875588b17", "vision"),
    ("Marqo/marqo-fashionCLIP", "44f4c655124ed71e90cbf528d82f508d69d8a81b", "retrieval"),
    ("timbrooks/instruct-pix2pix", "31519b5cb02a7fd89b906d88731cd4d6a7bbf88d", "preview"),
]

def ranged_download(url, output, label):
    response = httpx.head(url,follow_redirects=True,timeout=60)
    response.raise_for_status()
    total = int(response.headers["content-length"])
    direct_url = response.url
    chunk_size = 4 * 1024 * 1024
    parts = output.parent / (output.name + ".chunks")
    parts.mkdir(exist_ok=True)
    def part(index):
        start, end = index * chunk_size, min(total-1, (index+1)*chunk_size-1)
        file = parts / str(index)
        if file.exists() and file.stat().st_size == end-start+1: return
        for attempt in range(8):
            try:
                response = client.get(direct_url, headers={"Range":f"bytes={start}-{end}"})
                response.raise_for_status()
                if response.status_code != 206 or response.headers.get("content-range") != f"bytes {start}-{end}/{total}" or len(response.content) != end-start+1:
                    raise ValueError("Wrong or incomplete byte range")
                file.write_bytes(response.content)
                if index % 32 == 0: print(f"Downloading {label}: part {index+1}/{math.ceil(total/chunk_size)}", flush=True)
                return
            except (httpx.HTTPError, ValueError) as exc:
                print(f"Range retry {attempt+1}/8 {label} part {index+1}: {type(exc).__name__}",flush=True)
                time.sleep(min(10, attempt+1))
        raise RuntimeError(f"Range {index} incomplete; rerun to resume")
    with httpx.Client(timeout=60,follow_redirects=True,limits=httpx.Limits(max_connections=12,max_keepalive_connections=12)) as client:
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(part, range(math.ceil(total/chunk_size))))
    temporary = output.with_suffix(output.suffix + ".assembling")
    with temporary.open("wb") as writer:
        for index in range(math.ceil(total/chunk_size)):
            writer.write((parts / str(index)).read_bytes())
    temporary.replace(output)
    for piece in parts.iterdir(): piece.unlink()
    parts.rmdir()
    print(f"Downloaded {label} ({total//1024**2} MB)", flush=True)

def download(item):
    repo, revision, kind, filename = item
    output = ROOT / kind / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        return
    partial = output.with_suffix(output.suffix + ".part")
    url = f"https://huggingface.co/{repo}/resolve/{revision}/{filename}"
    if filename.endswith(".safetensors"):
        return ranged_download(url, output, f"{kind}/{filename}")
    for attempt in range(12):
        size = partial.stat().st_size if partial.exists() else 0
        try:
            with httpx.stream("GET", url, headers={"Range": f"bytes={size}-"} if size else {}, follow_redirects=True, timeout=180) as response:
                response.raise_for_status()
                mode = "ab" if size and response.status_code == 206 else "wb"
                with partial.open(mode) as file:
                    for chunk in response.iter_bytes(1024 * 1024):
                        file.write(chunk)
            partial.replace(output)
            print(f"Downloaded {kind}/{filename} ({output.stat().st_size // 1024**2} MB)", flush=True)
            return
        except (httpx.HTTPError, OSError) as exc:
            print(f"Retry {attempt+1}/12 {kind}/{filename}: {type(exc).__name__}", flush=True)
            time.sleep(min(10, attempt+1))
    raise RuntimeError(f"Download incomplete: {repo}/{filename}; rerun to resume")

def main():
    jobs = []
    for repo, revision, kind in MODELS:
        response = httpx.get(f"https://huggingface.co/api/models/{repo}/revision/{revision}", timeout=90)
        response.raise_for_status()
        for entry in response.json()["siblings"]:
            filename = entry["rfilename"]
            allowed = filename.endswith((".json", ".txt", ".jinja")) or filename.lower() in ("readme.md", "license", "license.md", "license.txt")
            if kind == "vision": allowed |= filename.endswith(".safetensors")
            elif kind == "retrieval": allowed |= filename == "open_clip_model.safetensors"
            else: allowed |= filename.endswith(".fp16.safetensors")
            if allowed:
                jobs.append((repo, revision, kind, filename))
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(download, jobs))
    (ROOT / "manifest.json").write_text(json.dumps(MODELS, indent=2), encoding="utf-8")
    print("All local model files downloaded.", flush=True)

if __name__ == "__main__":
    main()
