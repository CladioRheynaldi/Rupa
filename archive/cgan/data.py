"""Explicit licensed dataset only; never scans customer uploads."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageChops, ImageStat
import torch
from torch.utils.data import Dataset

def local_path(root,value):
    if not isinstance(value,str) or not value:
        raise ValueError("Nama file harus berupa path relatif dataset")
    path = (root/value).resolve()
    if root not in path.parents or not path.is_file():
        raise ValueError(f"File tidak ada atau berada di luar dataset: {value}")
    return path

def read_manifest(manifest,root):
    root = Path(root).resolve()
    records = []
    ids,garments,hashes = set(),{},{}
    for line_no,line in enumerate(Path(manifest).read_text(encoding="utf-8").splitlines(),1):
        if not line.strip(): continue
        r = json.loads(line)
        for key in ("id","garment_id","task","split","prompt_en","target","license","source","rights_confirmed"):
            if not r.get(key): raise ValueError(f"Baris {line_no}: lengkapi {key}")
        if any(not isinstance(r[k],str) or "REPLACE_" in r[k] for k in ("license","source")):
            raise ValueError("Isi lisensi dan sumber sebenarnya, bukan placeholder")
        if r["rights_confirmed"] is not True: raise ValueError("Hak penggunaan harus dikonfirmasi secara eksplisit")
        if r["id"] in ids: raise ValueError("ID sampel duplikat")
        ids.add(r["id"])
        if r["task"] not in ("edit","text_to_image") or r["split"] not in ("train","val","test"):
            raise ValueError("Task/split tidak dikenal")
        if not isinstance(r["prompt_en"],str) or len(r["prompt_en"].strip()) < 5:
            raise ValueError("prompt_en harus menjelaskan tampilan akhir dalam bahasa Inggris")
        prior = garments.setdefault(r["garment_id"],r["split"])
        if prior != r["split"]: raise ValueError("Kebocoran data: pakaian yang sama berada pada split berbeda")
        target = local_path(root,r["target"])
        with Image.open(target) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            target_image = im.copy()
            digest = hashlib.sha256(im.tobytes()+str(im.size).encode()).hexdigest()
        prior = hashes.setdefault(digest,r["split"])
        if prior != r["split"]: raise ValueError("Kebocoran data: gambar target identik berada pada split berbeda")
        if r["task"] == "edit":
            with Image.open(local_path(root,r.get("before"))) as im:
                before = ImageOps.exif_transpose(im).convert("RGB")
            with Image.open(local_path(root,r.get("mask"))) as im: mask = im.convert("L")
            if before.size != target_image.size or mask.size != before.size:
                raise ValueError("Foto awal, target, dan mask harus sejajar dan sama dimensi")
            if not set(mask.tobytes()).issubset({0,255}) or not mask.getbbox():
                raise ValueError("Mask harus biner: putih area edit, hitam area dipertahankan; tidak boleh kosong")
            outside = ImageOps.invert(mask)
            if outside.getbbox():
                # Different camera angle/background teaches the wrong editing task.
                mae = ImageStat.Stat(ImageChops.difference(before,target_image),mask=outside).mean
                if max(mae) > 5:
                    raise ValueError("Foto target berubah di luar mask; sejajarkan foto atau perbaiki mask")
        r["_target_sha256"] = digest
        records.append(r)
    if not records: raise ValueError("Manifest kosong")
    return records

def image_tensor(image,size,mask=False):
    image = ImageOps.pad(image,(size,size),method=Image.Resampling.NEAREST if mask else Image.Resampling.LANCZOS,color=0)
    import numpy as np
    a = torch.from_numpy(np.array(image,copy=True)).float()
    return a[None]/255 if mask else a.permute(2,0,1)/127.5-1

class GarmentDataset(Dataset):
    def __init__(self,records,root,embeddings,size=128):
        self.records,self.root,self.embeddings,self.size = records,Path(root).resolve(),embeddings,size
        self.cache = {}
    def __len__(self): return len(self.records)
    def __getitem__(self,i):
        if i in self.cache: return self.cache[i]
        r = self.records[i]
        with Image.open(local_path(self.root,r["target"])) as im:
            target = image_tensor(ImageOps.exif_transpose(im).convert("RGB"),self.size)
        if r["task"] == "edit":
            with Image.open(local_path(self.root,r["before"])) as im:
                source = image_tensor(ImageOps.exif_transpose(im).convert("RGB"),self.size)
            with Image.open(local_path(self.root,r["mask"])) as im:
                mask = image_tensor(im.convert("L"),self.size,True)
        else:
            source,mask = torch.zeros_like(target),torch.ones(1,self.size,self.size)
        self.cache[i] = (source,target,mask,self.embeddings[r["id"]])
        return self.cache[i]
