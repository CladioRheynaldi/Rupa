"""Opt-in experimental inference from the project's genuinely trained checkpoint."""
import base64
import functools
import io
import json
import os
from pathlib import Path
import secrets
from PIL import Image,ImageOps
from preview_errors import PreviewFailure

ROOT=Path(__file__).resolve().parents[2]
MODEL_DIR=Path(os.getenv("CGAN_MODEL_DIR",str(ROOT/".local/cgan/runs/magicbrush-clothing-v1")))

def status():
    try:
        meta=json.loads((MODEL_DIR/"metadata.json").read_text(encoding="utf-8"))
        ready=meta.get("steps",0)>0 and "edit" in meta.get("trained_tasks",[]) and (MODEL_DIR/"generator.safetensors").is_file()
        return {"ready":bool(ready),"experimental":True,"customer_ready":False,"epochs":meta.get("epoch",0),"samples":meta.get("samples",0)}
    except (OSError,ValueError):
        return {"ready":False,"experimental":True,"customer_ready":False,"epochs":0,"samples":0}

@functools.lru_cache(maxsize=1)
def checkpoint(version):
    import torch
    from .pipeline import load_generator
    return load_generator(MODEL_DIR,torch.device("cpu"))

@functools.lru_cache(maxsize=1)
def safety():
    import torch
    from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker
    from transformers import CLIPImageProcessor
    folder=ROOT/".local/models/preview"
    checker=StableDiffusionSafetyChecker.from_pretrained(folder/"safety_checker",local_files_only=True,use_safetensors=True,variant="fp16",torch_dtype=torch.float32).eval()
    processor=CLIPImageProcessor.from_pretrained(folder/"feature_extractor",local_files_only=True)
    return checker,processor

def preview(task):
    from local_engine import LOCK
    if not task.markup or not task.markup.details:
        return _preview_one(task)
    with LOCK:
        image = task.image
        instructions = []
        for index, detail in enumerate(task.markup.details):
            strokes = [s for s in task.markup.strokes if s.tool == "erase" or s.detailId == detail.id]
            if len(detail.text.strip()) < 5 or detail.x is None or detail.y is None or not any(s.tool == "draw" for s in strokes):
                raise ValueError("Setiap detail membutuhkan deskripsi, nomor, dan coretan area")
            markup = task.markup.model_copy(update={"strokes":strokes,"details":[]})
            try:
                result = _preview_one(task.model_copy(update={"image":image,"prompt":detail.text,"markup":markup}))
            except PreviewFailure as exc:
                raise PreviewFailure(exc.code, index+1) from exc
            image = result["image"]
            instructions.append(result["edit_instruction"])
        result["edit_instruction"] = " | ".join(instructions)
        return result

def _preview_one(task):
    import numpy as np
    import torch
    from local_engine import LOCK,generate,image_from,vision_model,edit_model
    from edit_mask import stroke_mask,crop_context,composite_strokes
    from .pipeline import encode
    from .data import image_tensor
    with LOCK:
        if not status()["ready"]: raise ValueError("Checkpoint cGAN terlatih belum tersedia")
        if not task.markup: raise ValueError("Coret area pakaian terlebih dahulu untuk memakai cGAN")
        original=image_from(task.image)
        mask=stroke_mask(original.size,task.markup)
        crop,box=crop_context(original,mask)
        english=generate("Translate this clothing edit instruction into English. Preserve the requested color, garment and detail. Return only one short instruction: "+task.prompt,max_tokens=80)
        vision_model.cache_clear();edit_model.cache_clear()
        import gc;gc.collect()
        generator,meta=checkpoint((MODEL_DIR/"generator.safetensors").stat().st_mtime_ns)
        size=meta["size"]
        source=image_tensor(crop,size)
        cropped_mask=mask.crop(box)
        mask_tensor=image_tensor(cropped_mask,size,True)
        text=encode([english])
        seed=task.seed if task.seed is not None else secrets.randbelow(2**31)
        rng=torch.Generator(device="cpu").manual_seed(seed)
        with torch.no_grad():
            generated=generator(source[None],mask_tensor[None],text,torch.randn(1,generator.noise_dim,generator=rng))[0]
        pixels=((generated.clamp(-1,1).permute(1,2,0)+1)*127.5).round().byte().numpy()
        square=Image.fromarray(pixels)
        fitted=ImageOps.contain(crop,(size,size))
        left,top=(size-fitted.width)//2,(size-fitted.height)//2
        edited=square.crop((left,top,left+fitted.width,top+fitted.height))
        result=composite_strokes(original,edited,box,mask)
        checker,processor=safety()
        with torch.no_grad():
            _,flags=checker(clip_input=processor(images=result,return_tensors="pt").pixel_values,images=np.array([np.asarray(result).astype(np.float32)/255]))
        if any(flags): raise PreviewFailure("IMAGE_CHECK_REJECTED")
        stream=io.BytesIO();result.save(stream,format="PNG")
        return {"image":base64.b64encode(stream.getvalue()).decode(),"model":"Rupa-cGAN-MagicBrush-v1 (experimental)",
            "illustrative":True,"experimental":True,"seed":seed,"edit_instruction":english,"preservation":"outside-selection"}
