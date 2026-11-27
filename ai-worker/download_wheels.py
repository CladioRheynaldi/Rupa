"""Fetch pinned local-inference wheels in small verified ranges on slow links."""
from pathlib import Path
import hashlib
import httpx
from packaging.tags import sys_tags
from packaging.utils import parse_wheel_filename
from download_models import ranged_download

if __name__ == "__main__":
    target = Path(__file__).resolve().parents[1] / ".local" / "wheels"
    target.mkdir(parents=True,exist_ok=True)
    tags = set(sys_tags())
    requirements = Path(__file__).with_name("requirements-local.txt").read_text().splitlines() + ["hf-xet==1.7.0"]
    for requirement in requirements:
        if not requirement or requirement.startswith("#"): continue
        name, version = requirement.split("==")
        metadata = httpx.get(f"https://pypi.org/pypi/{name}/{version}/json",timeout=90).json()
        choices = [entry for entry in metadata["urls"] if entry["filename"].endswith(".whl") and tags.intersection(parse_wheel_filename(entry["filename"])[3])]
        if not choices: raise RuntimeError(f"No compatible wheel: {requirement}")
        item = choices[0]
        file = target / item["filename"]
        if not file.exists(): ranged_download(item["url"],file,item["filename"])
        if hashlib.sha256(file.read_bytes()).hexdigest() != item["digests"]["sha256"]:
            raise RuntimeError(f"Checksum failed for {file.name}")
        print(f"Verified {file.name}",flush=True)
