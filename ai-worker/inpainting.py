"""Local masked garment editing. No customer data is used to train models."""
import base64
import functools
import gc
import io
import secrets
from PIL import Image, ImageDraw, ImageFilter

MODEL = "stable-diffusion-v1-5/stable-diffusion-inpainting"

def region_mask(size, region):
    mask = Image.new("L", size, 0)
    x, y = round(region.x * size[0]), round(region.y * size[1])
    right = min(size[0], round((region.x + region.width) * size[0]))
    bottom = min(size[1], round((region.y + region.height) * size[1]))
    ImageDraw.Draw(mask).rectangle((x, y, right - 1, bottom - 1), fill=255)
    return mask

def compose_region(original, generated, mask):
    # Feather inward only: alpha is exactly zero outside the customer's selection.
    from PIL import ImageChops
    alpha = ImageChops.multiply(mask, mask.filter(ImageFilter.GaussianBlur(3)))
    return Image.composite(generated.resize(original.size, Image.Resampling.LANCZOS), original, alpha)

@functools.lru_cache(maxsize=1)
def pipeline():
    import torch
    from diffusers import StableDiffusionInpaintPipeline, DPMSolverMultistepScheduler
    from local_engine import MODEL_ROOT
    pipe = StableDiffusionInpaintPipeline.from_pretrained(
        MODEL_ROOT / "inpaint", local_files_only=True, variant="fp16", use_safetensors=True,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    if torch.cuda.is_available():
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cpu")
    return pipe

def preview(task):
    import torch
    from local_engine import LOCK, generate, image_from, vision_model, edit_model
    with LOCK:
        original = image_from(task.image)
        # The model expects an English description of the final appearance.
        prompt = generate(
            "Write ONE short English visual description of ONLY the requested clothing detail after editing. "
            "Preserve the specified colors and motif. Do not write questions, alternatives or extra details. "
            "Example: add a pocket -> a small fabric patch pocket sewn onto the garment. Request: " + task.prompt,
            max_tokens=85,
        )
        if not prompt:
            raise ValueError("Deskripsi perubahan belum dapat diterjemahkan")
        vision_model.cache_clear()
        edit_model.cache_clear()
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        mask = region_mask(original.size, task.region)
        # Crop with context, then render at the model's native 512px. Small details
        # receive substantially more pixels than resizing the whole garment to 256px.
        box = mask.getbbox()
        padding = max(32, round(max(box[2]-box[0], box[3]-box[1]) * 0.8))
        crop_box = (max(0,box[0]-padding), max(0,box[1]-padding), min(original.width,box[2]+padding), min(original.height,box[3]+padding))
        crop, crop_mask = original.crop(crop_box), mask.crop(crop_box)
        seed = task.seed if task.seed is not None else secrets.randbelow(2**31)
        pipe = pipeline()
        with torch.inference_mode():
            output = pipe(
                prompt="Fashion product photograph, " + prompt + ", realistic fabric texture, neatly sewn clothing detail",
                negative_prompt="text, watermark, blurry, distorted, duplicate, extra limbs, nude, naked",
                image=crop.resize((512,512), Image.Resampling.LANCZOS),
                mask_image=crop_mask.resize((512,512), Image.Resampling.NEAREST),
                height=512, width=512, num_inference_steps=24, guidance_scale=7.5, strength=0.99,
                generator=torch.Generator(device="cpu").manual_seed(seed),
            )
        if output.nsfw_content_detected and output.nsfw_content_detected[0]:
            raise ValueError("Hasil tidak lolos pemeriksaan gambar. Gunakan area pakaian dan deskripsi detail yang jelas.")
        generated = original.copy()
        generated.paste(output.images[0].resize(crop.size, Image.Resampling.LANCZOS), crop_box[:2])
        final = compose_region(original, generated, mask)
        stream = io.BytesIO()
        final.save(stream, format="PNG")
        return {"image":base64.b64encode(stream.getvalue()).decode(), "illustrative":True,
                "model":MODEL, "seed":seed, "edit_instruction":prompt, "preservation":"outside-selection"}
