"""Real inference check: existing diffusion + customer strokes, never cGAN."""
import base64
import io
import os
import time
import httpx
from PIL import Image,ImageChops
from run_local import configure,ROOT
from server import DesignMarkup
from edit_mask import stroke_mask

configure()
original_bytes=(ROOT/"public/images/dress.jpg").read_bytes()
markup={"strokes":[{"tool":"draw","width":.12,"points":[[.40,.62],[.56,.67]]}]}
started=time.monotonic()
response=httpx.post("http://127.0.0.1:8000/preview",headers={"Authorization":"Bearer "+os.environ["AI_WORKER_TOKEN"]},
    json={"prompt":"Change the marked fabric area to blue. Keep the fabric texture.","image":base64.b64encode(original_bytes).decode(),"mode":"preview","markup":markup},timeout=600)
response.raise_for_status()
result=response.json()
original=Image.open(io.BytesIO(original_bytes)).convert("RGB")
output_bytes=base64.b64decode(result["image"])
output=Image.open(io.BytesIO(output_bytes)).convert("RGB")
assert original.size == output.size
mask=stroke_mask(original.size,DesignMarkup(**markup))
outside=ImageChops.invert(mask).convert("RGB")
assert ImageChops.multiply(ImageChops.difference(original,output),outside).getbbox() is None
assert result["preservation"] == "outside-selection"
(ROOT/"test-results/markup-ai-result.png").write_bytes(output_bytes)
print("PASS real diffusion + freehand mask:",round(time.monotonic()-started,1),"seconds; outside mask pixel-identical; model:",result["model"],flush=True)
