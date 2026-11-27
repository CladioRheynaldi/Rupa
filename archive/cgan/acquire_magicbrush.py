"""Public MagicBrush clothing subset with source/attribution and grouped splits."""
import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib
import io
import json
from pathlib import Path
import re
import time
import httpx
from PIL import Image,ImageOps,ImageChops,ImageFilter
from .data import read_manifest

DATASET="osunlp/MagicBrush"
SOURCE="https://huggingface.co/datasets/osunlp/MagicBrush"
GARMENT=re.compile(r"\b(shirts?|blouses?|dresses?|jackets?|sweaters?|coats?|hoodies?|flannel|t-shirts?|vests?|pants|trousers|skirts?)\b",re.I)
WORDS=re.compile(r"\b(shirts?|blouses?|dresses?|jackets?|sweaters?|coats?|hoodies?|pockets?|logos?|flannel|t-shirts?|vests?|pants|trousers|skirts?)\b",re.I)
EXCLUDE=re.compile(r"\b(naked|nude|undress|underwear|bikini|sexy|nipple|breast|dogs?|horses?|zebras?|animals?|planes?|airways|hydrants?)\b",re.I)

def get(client,url,**kwargs):
    for attempt in range(5):
        try:
            response=client.get(url,**kwargs)
            if response.status_code == 429:
                delay=max(15,int(response.headers.get("retry-after","60")))
                print(f"Dataset service rate-limited; waiting {delay}s before retry",flush=True)
                remaining=delay
                while remaining>0:
                    chunk=min(60,remaining);time.sleep(chunk);remaining-=chunk
                continue
            response.raise_for_status()
            return response
        except httpx.HTTPError:
            if attempt==4: raise
            time.sleep(min(5,attempt+1))
    raise RuntimeError("Dataset endpoint remained rate-limited after retries")

def acquire(root,maximum,cached_only=False):
    root=Path(root).resolve();root.mkdir(parents=True,exist_ok=True)
    for folder in ("metadata","images","masks","raw"): (root/folder).mkdir(exist_ok=True)
    with httpx.Client(timeout=60,follow_redirects=True,limits=httpx.Limits(max_connections=8)) as client:
        repo=get(client,"https://huggingface.co/api/datasets/"+DATASET).json()
        def page(offset):
            file=root/"metadata"/f"train-{offset}.json"
            if file.exists(): return json.loads(file.read_text(encoding="utf-8"))
            data=get(client,"https://datasets-server.huggingface.co/rows",params={"dataset":DATASET,"config":"default","split":"train","offset":offset,"length":100}).json()
            rows=[v["row"] for v in data["rows"]]
            file.write_text(json.dumps(rows),encoding="utf-8")
            return rows
        selected=[]
        offsets=sorted(int(p.stem.split("-")[1]) for p in (root/"metadata").glob("train-*.json")) if cached_only else range(0,8807,100)
        with ThreadPoolExecutor(max_workers=1) as pool:
            futures=[pool.submit(page,offset) for offset in offsets]
            for i,future in enumerate(as_completed(futures)):
                selected.extend(r for r in future.result() if GARMENT.search(r["instruction"]) and not EXCLUDE.search(r["instruction"]))
                if (i+1)%10==0: print(f"Metadata pages {i+1}/89; clothing candidates {len(selected)}",flush=True)
        selected=sorted(selected,key=lambda r:(str(r["img_id"]),r["turn_index"]))[:maximum]
        def image(row,field):
            info=row[field]
            raw=root/"raw"/f"{row['img_id']}-{row['turn_index']}-{field}.png"
            if not raw.exists():
                with Image.open(io.BytesIO(get(client,info["src"]).content)) as im: im.save(raw)
            with Image.open(raw) as im: return im.copy()
        def sample(row):
            key=f"mb-{row['img_id']}-{row['turn_index']}"
            record_path=root/"metadata"/(key+".record.json")
            if record_path.exists():
                previous=json.loads(record_path.read_text(encoding="utf-8"))
                if previous.get("preprocessing_version")==2: return previous
            before,target=image(row,"source_img").convert("RGB"),image(row,"target_img").convert("RGB")
            # Restrict to aligned pairs; never resize different-aspect source photos
            # to pretend that they are registered with the edited target.
            if before.size!=target.size:
                if abs(before.width/before.height-target.width/target.height)>.005:
                    return {"rejected":key,"reason":"source_target_aspect_mismatch"}
                before=before.resize(target.size,Image.Resampling.LANCZOS)
            raw_mask=image(row,"mask_img")
            if "A" not in raw_mask.getbands(): return {"rejected":key,"reason":"publisher_mask_missing_alpha"}
            mask_image=ImageOps.invert(raw_mask.getchannel("A"))
            if mask_image.size!=target.size: return {"rejected":key,"reason":"mask_size_mismatch"}
            mask=mask_image.point(lambda p:255 if p>=128 else 0)
            if not mask.getbbox(): return {"rejected":key,"reason":"empty_mask"}
            if sum(mask.histogram()[128:])/(mask.width*mask.height)>.85:
                return {"rejected":key,"reason":"mask_covers_most_of_scene"}
            # Keep publisher edits within its official mask; outside pixels are
            # restored to source. Record this preprocessing explicitly.
            target=Image.composite(target,before,mask)
            if ImageChops.difference(before,target).getbbox() is None: return {"rejected":key,"reason":"unchanged"}
            box=mask.getbbox();pad=max(48,round(max(box[2]-box[0],box[3]-box[1])*.7))
            box=(max(0,box[0]-pad),max(0,box[1]-pad),min(before.width,box[2]+pad),min(before.height,box[3]+pad))
            before,target,mask=before.crop(box),target.crop(box),mask.crop(box)
            before.save(root/"images"/(key+"-before.png"));target.save(root/"images"/(key+"-target.png"));mask.save(root/"masks"/(key+".png"))
            group=int(hashlib.sha256(str(row["img_id"]).encode()).hexdigest()[:8],16)%10
            split="test" if group==0 else "val" if group==1 else "train"
            record={"id":key,"garment_id":"magicbrush-coco-"+str(row["img_id"]),"task":"edit","split":split,
                "prompt_en":row["instruction"],"before":f"images/{key}-before.png","target":f"images/{key}-target.png","mask":f"masks/{key}.png",
                "license":"CC-BY-4.0 (MagicBrush dataset release)","source":SOURCE+"; COCO img_id="+str(row["img_id"])+"; turn="+str(row["turn_index"]),
                "rights_confirmed":True,"preprocessing_version":2,"preprocessing":"invert publisher transparency alpha; threshold128; target composite inside official edit area; aligned context crop",
                "label_kind":"publisher edit instruction; not a full-image description","source_revision_observed":repo.get("sha")}
            record_path.write_text(json.dumps(record,indent=2),encoding="utf-8")
            return record
        records,rejected=[],[]
        with ThreadPoolExecutor(max_workers=1) as pool:
            futures=[pool.submit(sample,r) for r in selected]
            for i,future in enumerate(as_completed(futures)):
                r=future.result()
                (rejected if "rejected" in r else records).append(r)
                if (i+1)%10==0: print(f"Candidate pairs {i+1}/{len(selected)}; accepted {len(records)}",flush=True)
    records.sort(key=lambda r:r["id"])
    manifest=root/"manifest.jsonl"
    manifest.write_text("\n".join(json.dumps(r) for r in records),encoding="utf-8")
    read_manifest(manifest,root)
    summary={"dataset":DATASET,"source":SOURCE,"license":"CC-BY-4.0","attribution":"Kai Zhang et al., MagicBrush: A Manually Annotated Dataset for Instruction-Guided Image Editing, NeurIPS 2023",
        "revision_observed":repo.get("sha"),"samples":len(records),"splits":{s:sum(r["split"]==s for r in records) for s in ("train","val","test")},
        "rejected":rejected,"scope":"clothing-related editing only; no text-to-image training labels; public examples include edited/synthetic targets"}
    (root/"PROVENANCE.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in summary.items() if k!="rejected"}),flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--output",required=True);p.add_argument("--maximum",type=int,default=240)
    p.add_argument("--cached-only",action="store_true")
    a=p.parse_args();acquire(a.output,a.maximum,a.cached_only)
