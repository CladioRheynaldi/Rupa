"""Real pretrained inference, kept separate from fast unit/contract tests."""
from pathlib import Path
import base64
import json
import time
import sys
import httpx
from run_local import configure, ROOT
import os

configure()
headers = {"Authorization":"Bearer " + os.environ["AI_WORKER_TOKEN"]}
client = httpx.Client(base_url="http://127.0.0.1:8000",headers=headers,timeout=600)
refs = json.loads((ROOT / "test-results" / "ai-references.json").read_text(encoding="utf-8"))

def call(endpoint, payload):
    started = time.monotonic()
    response = client.post(endpoint,json=payload)
    response.raise_for_status()
    result = response.json()
    print(endpoint, "seconds=", round(time.monotonic()-started,1), "model=", result.get("model"), flush=True)
    return result

if "search" in sys.argv:
    exact = call("/search",{"query":"red skull center tshirt", "original_query":"tambahkan logo tengkorak di tengah kaos merah", "references":refs})
    assert exact["ids"] == ["tshirt-red-skull"], exact
    broad = call("/search",{"query":"red tshirt", "original_query":"kaos merah", "references":refs})
    assert len(broad["ids"]) == 4, broad
    missing = call("/search",{"query":"red dragon tshirt", "original_query":"tambahkan logo naga di kaos merah", "references":refs})
    assert missing["ids"] == [], missing
    print("PASS actual FashionCLIP: exact attributes, all four matching references, unsupported motif returns empty.",flush=True)
if "analysis" in sys.argv:
    image = base64.b64encode((ROOT/"test-results"/"ai-base.jpg").read_bytes()).decode()
    result = call("/analyze",{"prompt":"Tambahkan logo tengkorak di tengah kaos merah", "image":image,"mode":"design"})
    assert len(result["text"]) > 50
    (ROOT/"test-results"/"ai-analysis.txt").write_text(result["text"],encoding="utf-8")
    print(result["text"],flush=True)
    sizes = call("/analyze",{"prompt":"Lingkar pinggang pakaian sekarang 80 cm, target 76 cm. Apa yang perlu dikonfirmasi sebelum dikecilkan?", "mode":"measurements", "changes":[{"serviceId":"waist","measurements":{"Lingkar pinggang pakaian sekarang":80,"Lingkar pinggang pakaian yang diinginkan":76}}]})
    assert "selisih -4 cm" in sizes["text"]
    (ROOT/"test-results"/"ai-measurements.txt").write_text(sizes["text"],encoding="utf-8")
    print(sizes["text"],flush=True)
if "preview" in sys.argv:
    original = (ROOT/"public"/"images"/"dress.jpg").read_bytes()
    result = call("/preview",{"prompt":"Ubah warna gaun menjadi biru. Pertahankan bentuk pakaian.","image":base64.b64encode(original).decode(),"mode":"preview"})
    assert result["illustrative"] is True
    (ROOT/"test-results"/"ai-preview.jpg").write_bytes(base64.b64decode(result["image"]))
    print("PASS actual image-edit inference; inspect the saved image for quality.",flush=True)
