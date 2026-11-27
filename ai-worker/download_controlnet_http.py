"""Resumable HTTP range fallback with pinned revision and Git LFS SHA256 verification."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import httpx,hashlib,math
root=Path(__file__).resolve().parents[1]/'.local/models/controlnet-sdxl-canny-small'
root.mkdir(parents=True,exist_ok=True)
base='https://huggingface.co/diffusers/controlnet-canny-sdxl-1.0-small/resolve/edd85f64c5f87dfb6d73762949d9daca16389518/'
name='diffusion_pytorch_model.fp16.safetensors'
head=httpx.head(base+name,timeout=30)
assert head.status_code in (200,302,307),f'Metadata status {head.status_code}'
size=int(head.headers['x-linked-size']);expected=head.headers['x-linked-etag'].strip('"')
assert len(expected)==64
target=root/name
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==expected:
 print('Verified existing ControlNet weights');raise SystemExit
parts=root/'http-parts';parts.mkdir(exist_ok=True)
chunk=8*1024*1024
def download(i):
 start=i*chunk;end=min(size,start+chunk)-1;part=parts/f'{i:03}.part'
 if part.exists() and part.stat().st_size==end-start+1:return part
 for attempt in range(3):
  try:
   with httpx.stream('GET',base+name+f'?download=true&part={i}',headers={'Range':f'bytes={start}-{end}'},follow_redirects=True,timeout=90) as response:
    response.raise_for_status()
    assert response.status_code==206 and response.headers.get('content-range','').startswith(f'bytes {start}-{end}/')
    with part.open('wb') as handle:
     for data in response.iter_bytes(1024*1024):handle.write(data)
   assert part.stat().st_size==end-start+1
   print('Downloaded part',i+1,'/',math.ceil(size/chunk),flush=True);return part
  except Exception:
   if attempt==2:raise
with ThreadPoolExecutor(max_workers=4) as pool:ordered=list(pool.map(download,range(math.ceil(size/chunk))))
digest=hashlib.sha256()
with (root/(name+'.verified-download')).open('wb') as out:
 for part in ordered:
  raw=part.read_bytes();digest.update(raw);out.write(raw)
assert digest.hexdigest()==expected,'SHA256 mismatch'
(root/(name+'.verified-download')).replace(target)
for filename in ['config.json','README.md']:
 response=httpx.get(base+filename,follow_redirects=True,timeout=30);response.raise_for_status();(root/filename).write_bytes(response.content)
print('ControlNet ready; SHA256 verified; bytes',size,flush=True)
