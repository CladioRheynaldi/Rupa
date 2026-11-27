"""Pinned SDXL fp16 weights, resumable ranged writes with SHA256 verification."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,time,httpx,os
ROOT=Path(__file__).resolve().parents[1]/".local/models/sdxl-inpaint"
REPO="diffusers/stable-diffusion-xl-1.0-inpainting-0.1"
REVISION="115134f363124c53c7d878647567d04daf26e41e"
CHUNK=4*1024*1024

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    with httpx.Client(follow_redirects=True,timeout=90) as client:
        metadata=client.get(f"https://huggingface.co/api/models/{REPO}/revision/{REVISION}?blobs=true");metadata.raise_for_status()
        files=[x for x in metadata.json()["siblings"] if x["rfilename"].endswith((".json",".txt",".fp16.safetensors")) or x["rfilename"]=="README.md"]
        for item in files:
            name=item["rfilename"];target=ROOT/name;target.parent.mkdir(parents=True,exist_ok=True)
            checksum=item.get("lfs",{}).get("sha256")
            if target.exists() and (not checksum or sha(target)==checksum):continue
            url=f"https://huggingface.co/{REPO}/resolve/{REVISION}/{name}"
            if not checksum:
                r=client.get(url);r.raise_for_status();target.write_bytes(r.content);continue
            total=item["lfs"]["size"];partial=target.with_suffix(target.suffix+".partial");progress=target.with_suffix(target.suffix+".progress.json")
            try:done=set(json.loads(progress.read_text()) if progress.exists() and partial.exists() else [])
            except (ValueError,OSError):done=set()
            with partial.open("ab") as f:f.truncate(total)
            print(f"Downloading {name}: {total//1024**2} MB",flush=True)
            import threading
            lock=threading.Lock()
            def part(index):
                if index in done:return
                start=index*CHUNK;end=min(total-1,start+CHUNK-1)
                for attempt in range(6):
                    try:
                        response=client.get(url,headers={"Range":f"bytes={start}-{end}"});response.raise_for_status()
                        if response.status_code!=206 or response.headers.get("content-range")!=f"bytes {start}-{end}/{total}" or len(response.content)!=end-start+1:raise ValueError("Incomplete range")
                        with partial.open("r+b") as f:f.seek(start);f.write(response.content);f.flush();os.fsync(f.fileno())
                        with lock:
                            done.add(index)
                            pending=progress.with_suffix(".tmp")
                            with pending.open("w") as log:log.write(json.dumps(sorted(done)));log.flush();os.fsync(log.fileno())
                            pending.replace(progress)
                            if len(done)%64==0:print(f"{name}: {len(done)*CHUNK//1024**2}/{total//1024**2} MB",flush=True)
                        return
                    except (httpx.HTTPError,ValueError):time.sleep(attempt+1)
                raise RuntimeError(f"Download incomplete: {name} part {index}; rerun to resume")
            with ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(part,range((total+CHUNK-1)//CHUNK)))
            if sha(partial)!=checksum:raise RuntimeError("Checksum mismatch: "+name)
            partial.replace(target);progress.unlink(missing_ok=True)
            print("Verified "+name,flush=True)
    (ROOT/"PROVENANCE.json").write_text(json.dumps({"repo":REPO,"revision":REVISION,"license":"CreativeML Open RAIL++-M","files":[x["rfilename"] for x in files]},indent=2))
    print("SDXL ready",flush=True)

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(8*1024*1024),b""):h.update(block)
    return h.hexdigest()
if __name__=="__main__":main()
