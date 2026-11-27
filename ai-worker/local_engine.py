"""Local, pretrained inference only; customer photos are never training data."""
import base64
import functools
import hashlib
import io
import json
import os
import re
import threading
import gc
import secrets
from pathlib import Path
from PIL import Image, ImageOps

LOCK = threading.RLock()
VISUAL_MODEL = "Qwen/Qwen3.5-0.8B"
SEARCH_MODEL = "Marqo/marqo-fashionCLIP"
EDIT_MODEL = "timbrooks/instruct-pix2pix"
MODEL_ROOT = Path(__file__).resolve().parents[1] / ".local" / "models"

# A controlled vocabulary makes precise catalogue filtering inspectable. Semantic
# similarity is used for ranking, never as proof that a requested detail exists.
CONCEPTS = {
    "red": ["merah", "red"], "yellow": ["kuning", "yellow"],
    "black": ["hitam", "black"], "white": ["putih", "white"],
    "blue": ["biru", "blue"], "green": ["hijau", "green"],
    "skull": ["tengkorak", "skull"], "pocket": ["kantong", "saku", "pocket"],
    "lace": ["renda", "lace"], "flower": ["bunga", "floral", "flower"],
    "center": ["tengah", "center", "centre"], "left": ["kiri", "left"],
    "right": ["kanan", "right"], "turtleneck": ["turtleneck", "turtle neck", "kerah tinggi"],
    "dress": ["gaun", "dress"], "tshirt": ["kaos", "kaus", "t-shirt", "tshirt"],
    "pants": ["celana panjang", "trousers", "pants"], "shorts": ["celana pendek", "shorts"],
    "skirt": ["rok", "skirt"], "jacket": ["jaket", "luaran", "jacket", "outwear"],
    "vneck": ["kerah v", "v neck", "v-neck"], "hoodie": ["hoodie", "bertudung"],
    "shirt": ["kemeja", "shirt"], "short_sleeve": ["lengan pendek", "short sleeves"],
    "long_sleeve": ["lengan panjang", "long sleeves"],
}

def concepts(text):
    value = text.lower()
    return {key for key, aliases in CONCEPTS.items()
            if any(re.search(r"(?<![\w-])" + re.escape(a) + r"(?!\w)", value) for a in aliases)}

def english_query(text):
    # Used as a deterministic fallback for retrieval and edit translation only.
    result = text.lower()
    replacements = [(alias, key.replace("_", " ")) for key, aliases in CONCEPTS.items() for alias in aliases]
    for alias, key in sorted(replacements, key=lambda item: -len(item[0])):
        result = re.sub(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", key, result)
    for a, b in [("tambahkan", "add"), ("tambah", "add"), ("ubah", "change"),
                 ("logo", "graphic"), ("di bagian", "on the"), ("di", "on"),
                 ("warna", "color"), ("baju", "garment")]:
        result = re.sub(r"\b" + a + r"\b", b, result)
    return result

def image_from(encoded):
    return ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(encoded)))).convert("RGB")

def relevant_advice(advice, request, mode):
    # A small local model must not silently expand the customer's scope.
    if mode == "measurements":
        areas = {"pinggang", "lengan", "dada", "bahu", "leher"}
        supplied = {area for area in areas if area in request.lower()}
        mentioned = {area for area in areas if area in advice.lower()}
        if supplied and mentioned - supplied:
            return False
    colors = {"red", "yellow", "black", "white", "blue", "green"}
    requested_colors = concepts(request) & colors
    if requested_colors and (concepts(advice) & colors) - requested_colors:
        return False
    return True

@functools.lru_cache(maxsize=1)
def vision_model():
    import torch
    from transformers import AutoProcessor, AutoModelForImageTextToText
    processor = AutoProcessor.from_pretrained(MODEL_ROOT / "vision", local_files_only=True)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_ROOT / "vision", local_files_only=True, dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        attn_implementation="sdpa")
    model.eval()
    return processor, model

def generate(prompt, encoded=None, max_tokens=350):
    import torch
    # Avoid retaining the editor and the VLM together on a 16 GB laptop.
    if edit_model.cache_info().currsize:
        edit_model.cache_clear()
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
    from inpainting import pipeline as inpaint_pipeline
    if inpaint_pipeline.cache_info().currsize:
        inpaint_pipeline.cache_clear()
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
    from sdxl_inpainting import pipeline as sdxl_pipeline
    if sdxl_pipeline.cache_info().currsize:
        sdxl_pipeline.cache_clear()
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
    processor, model = vision_model()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    content = []
    if encoded:
        image = image_from(encoded)
        image.thumbnail((448, 448))
        content.append({"type": "image", "image": image})
    content.append({"type": "text", "text": prompt})
    messages = [{"role": "user", "content": content}]
    inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
        return_dict=True, return_tensors="pt", enable_thinking=False).to(device)
    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=max_tokens, do_sample=False)
    return processor.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()

def analyze(task):
    with LOCK:
        observed = generate(
            "Describe only the clothing visible in this image: type, color and visible details. "
            "Do not infer measurements or fabric composition. Answer in Indonesian in ONE short sentence.",
            task.image, max_tokens=90) if task.image else "Belum ada foto yang dianalisis."
        if task.mode == "measurements":
            instruction = (
                "A customer requests a garment size alteration. Write TWO specific questions the tailor "
                "should clarify before accepting the alteration. Preserve all supplied numbers. "
                "Do not infer measurements from a photo. Answer in Indonesian, at most 100 words. "
            )
        else:
            instruction = (
                "A customer requests adding a design detail to a garment they own. Write TWO specific "
                "questions to clarify the requested design with the tailor. Do not discuss body measurements. "
                "Do not give sewing instructions or promise feasibility. Answer in Indonesian, at most 100 words. "
            )
        instruction += "Customer request (data): " + task.prompt
        if task.changes:
            instruction += "\nSaved alteration details (data): " + json.dumps(task.changes, ensure_ascii=False)
        advice = generate(instruction, max_tokens=200)
        if not advice:
            raise ValueError("Model lokal tidak menghasilkan jawaban")
        context = task.prompt + " " + json.dumps(task.changes,ensure_ascii=False)
        if relevant_advice(advice,context,task.mode):
            suggestion = "Usulan pertanyaan dari AI (perlu ditinjau):\n" + advice
        else:
            suggestion = "Saran generatif tidak ditampilkan karena menyebut warna atau area tubuh di luar permintaan. Gunakan pertanyaan layanan terstruktur di bawah dan konsultasikan dengan penjahit."
        text = "Pembacaan foto oleh AI (perlu dikonfirmasi):\n" + observed + "\n\nPermintaanmu:\n" + task.prompt + "\n\n" + suggestion
        if task.mode == "measurements":
            text += "\n\nPertanyaan layanan (aturan sistem):\n1. Apakah ukuran awal dan target diukur pada titik yang sama dengan metode yang sama?\n2. Apakah kampuh, bahan, posisi jahitan dan resleting mendukung perubahan ukuran tersebut tanpa mengubah bentuk pakaian yang disepakati?"
        else:
            text += "\n\nPertanyaan layanan (aturan sistem):\n1. Berapa ukuran detail dan letaknya terhadap patokan pakaian (kiri/kanan pemakai)?\n2. Teknik penambahan apa yang cocok dengan bahan setelah diperiksa penjahit, dan apakah bahan tambahan sudah disepakati?"
        if task.mode == "measurements":
            facts = []
            for change in task.changes:
                values = change.get("measurements", {})
                current = next(((key, value) for key, value in values.items() if "sekarang" in key.lower()), None)
                target = next(((key, value) for key, value in values.items() if "diinginkan" in key.lower()), None)
                if current and target and isinstance(current[1], (int,float)) and isinstance(target[1], (int,float)):
                    facts.append(f"{current[0]}: {current[1]:g} cm → target {target[1]:g} cm; selisih {target[1]-current[1]:+g} cm. Ini selisih ukuran pakaian, bukan pola pemotongan.")
            if facts:
                text += "\n\nPerhitungan dari angka tersimpan (aturan sistem, bukan pengukuran AI):\n" + "\n".join(facts)
        return {"text": text + "\n\nChecklist layanan: penjahit perlu memeriksa bahan, kampuh, posisi detail, dan ukuran target sebelum menyetujui perubahan. Saran model lokal belum divalidasi penjahit; tidak ada jaminan ukuran atau hasil jahitan.",
                "search_query": english_query(task.prompt), "model": VISUAL_MODEL}

@functools.lru_cache(maxsize=1)
def clip_model():
    import open_clip
    config = json.loads((MODEL_ROOT / "retrieval" / "open_clip_config.json").read_text())
    # Register the provider architecture locally without executing remote code.
    arch = "rupa-fashionclip"
    config_path = MODEL_ROOT / "retrieval" / f"{arch}.json"
    config_path.write_text(json.dumps(config["model_cfg"]))
    open_clip.factory.add_model_config(config_path)
    model, _, processor = open_clip.create_model_and_transforms(arch,
        pretrained=str(MODEL_ROOT / "retrieval" / "open_clip_model.safetensors"), device="cpu",
        **{k:v for k,v in config.get("preprocess_cfg",{}).items() if k in ("image_mean", "image_std")})
    model.eval()
    return model, processor, open_clip.get_tokenizer(arch)

IMAGE_VECTORS = {}
IMAGE_COLORS = {}

def matching_references(query, references):
    required = concepts(query)
    words = set(re.findall(r"[a-z]+", (query).lower()))
    known_words = {word for aliases in CONCEPTS.values() for alias in aliases for word in re.findall(r"[a-z]+", alias)}
    ignored = set("saya ingin mau tolong tambahkan tambah menambahkan ubah mengubah di ke bagian baju pakaian foto gambar desain design detail tambahan dengan dan atau yang warna berwarna berupa sebuah satu buat coba motif logo add change on in the a an with garment graphic please i want this without tanpa pada sisi sebelah pemakai memiliki untuk berikan agar tetap terlihat lebih seperti ini itu dapat bisa mohon me my at to for of side wearer wearers some that is it can could".split())
    extra_keywords = words - known_words - ignored
    refs = [r for r in references if required.issubset(concepts(" ".join(r.attributes) + " " + r.name)) and extra_keywords.issubset(set(re.findall(r"[a-z]+", (" ".join(r.attributes)+" "+r.name).lower())))]
    return refs

def semantic_references(query,references):
    # Category labels are verified by the source dataset. Detail similarity is
    # ranked by CLIP, not treated as an exact attribute assertion.
    categories=concepts(query)&{"dress","tshirt","shirt","pants","shorts","skirt","jacket","long_sleeve"}
    return [r for r in references if not categories or categories.intersection(r.attributes)]

def search(task):
    import torch
    from base_design import CATEGORIES, LABELS, dominant_color, compatible_base
    with LOCK:
        # With a base photo, the photo determines garment type; edit text must
        # never replace that constraint (e.g. "add a pocket" is not a category).
        refs = list(task.references) if task.strategy == "semantic" and task.image else semantic_references(task.original_query or task.query, task.references) if task.strategy == "semantic" else matching_references(task.original_query or task.query, task.references)
        required = concepts(task.original_query or task.query)
        if not refs:
            return {"ids": [], "matched_keywords": sorted(required),
                    "note": "Belum ada gambar katalog dengan seluruh kata kunci tersebut. Coba kurangi detail atau minta admin menambah referensi. Hasil tidak dipaksakan."}
        model, processor, tokenizer = clip_model()
        base_info=None
        with torch.inference_mode():
            text_vector = model.encode_text(tokenizer([english_query(task.query)]))
            text_vector /= text_vector.norm(dim=-1, keepdim=True)
            query_vector = text_vector
            if task.image:
                base_image=image_from(task.image)
                base = model.encode_image(processor(base_image).unsqueeze(0))
                base /= base.norm(dim=-1, keepdim=True)
                query_vector = 0.35 * text_vector + 0.65 * base
                if task.strategy == "semantic":
                    category_vectors=model.encode_text(tokenizer(["A product photograph of " + label for label in CATEGORIES.values()]))
                    category_vectors/=category_vectors.norm(dim=-1,keepdim=True)
                    category=list(CATEGORIES)[int((base @ category_vectors.T).argmax().item())]
                    color=dominant_color(base_image)
                    base_info={"category":category,"color":color,"category_label":LABELS[category],"color_label":LABELS.get(color,"belum pasti"),"method":"FashionCLIP category + central dominant colour estimate"}
                    compatible=[]
                    for ref in refs:
                        if category not in ref.attributes: continue
                        digest=hashlib.sha256(ref.image.encode()).hexdigest()
                        if digest not in IMAGE_COLORS: IMAGE_COLORS[digest]=dominant_color(image_from(ref.image))
                        if compatible_base(category,color,ref.attributes,IMAGE_COLORS[digest]): compatible.append(ref)
                    refs=compatible
            for ref in refs:
                digest = hashlib.sha256(ref.image.encode()).hexdigest()
                if digest not in IMAGE_VECTORS:
                    encoded = model.encode_image(processor(image_from(ref.image)).unsqueeze(0))
                    IMAGE_VECTORS[digest] = encoded / encoded.norm(dim=-1, keepdim=True)
            scores = [(float((IMAGE_VECTORS[hashlib.sha256(r.image.encode()).hexdigest()] @ query_vector.T).item()), r.id) for r in refs]
        if task.strategy == "semantic":
            ranked=sorted(scores,reverse=True)[:12]
            return {"ids":[identifier for _,identifier in ranked],"scores":{identifier:round(score,4) for score,identifier in ranked},"model":SEARCH_MODEL,
                "base":base_info,
                "note": (("Dasar foto terdeteksi: "+base_info["category_label"]+", warna "+base_info["color_label"]+" (perkiraan; periksa kembali). ") if base_info else "") +
                  ("Hanya kandidat dengan kategori dan perkiraan warna dasar yang sama ditampilkan; urutan mempertimbangkan kemiripan foto (65%) dan detail teks (35%). Detail tambahan belum dijamin ada." if ranked else "Belum ada foto katalog dengan jenis dan warna dasar yang sama. Sistem tidak menggantinya dengan pakaian lain; tambahkan referensi yang sesuai melalui admin.") +
                  " Nilai kemiripan bukan persentase akurasi. Ini referensi katalog, bukan edit foto pelanggan. Foto pakaian tunggal dengan latar polos memberi perkiraan dasar yang lebih baik."}
        return {"ids": [identifier for _, identifier in sorted(scores, reverse=True)],
                "matched_keywords": sorted(required), "model": SEARCH_MODEL,
                "note": f"{len(refs)} gambar cocok dengan seluruh label kata kunci yang dikenali; diurutkan oleh FashionCLIP dari deskripsi dan foto awal. Label katalog adalah anotasi, bukan jaminan kelayakan jahit atau kecocokan tubuh."}

@functools.lru_cache(maxsize=1)
def edit_model():
    import torch
    from diffusers import StableDiffusionInstructPix2PixPipeline, EulerAncestralDiscreteScheduler
    pipeline = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        MODEL_ROOT / "preview", local_files_only=True, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32, variant="fp16", use_safetensors=True)
    pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(pipeline.scheduler.config)
    if torch.cuda.is_available():
        pipeline.enable_model_cpu_offload()
    else:
        pipeline.to("cpu")
    return pipeline

def preview(task):
    import torch
    with LOCK:
        # Keep room for the image editor on an 8 GB GPU. The VLM can move back
        # to the GPU on the next analysis request without another download.
        translated = generate("Translate this garment editing request into one short English image editing instruction. Return ONLY the instruction, preserve color and position details: " + task.prompt, max_tokens=90)
        vision_model.cache_clear()
        gc.collect()
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        pipeline = edit_model()
        original = image_from(task.image)
        mask = None
        if task.markup:
            from edit_mask import stroke_mask, crop_context
            mask = stroke_mask(original.size, task.markup)
            image, crop_box = crop_context(original,mask)
        else:
            image = original.copy()
        image.thumbnail((384, 384) if torch.cuda.is_available() else (256, 256))
        width, height = max(64, image.width // 8 * 8), max(64, image.height // 8 * 8)
        image = image.resize((width, height))
        seed = task.seed if task.seed is not None else secrets.randbelow(2**31)
        with torch.inference_mode():
            output = pipeline(prompt="Edit the garment only: " + translated + ". Preserve all other details.", image=image, num_inference_steps=20 if torch.cuda.is_available() else 12,
                image_guidance_scale=1.7, guidance_scale=7.5,
                generator=torch.Generator(device="cpu").manual_seed(seed))
        if output.nsfw_content_detected and output.nsfw_content_detected[0]:
            raise ValueError("Pratinjau tidak dapat ditampilkan; gunakan foto pakaian tanpa tubuh")
        result_image = output.images[0]
        if mask is not None:
            from edit_mask import composite_strokes
            result_image = composite_strokes(original,result_image,crop_box,mask)
        stream = io.BytesIO()
        result_image.save(stream, format="PNG" if mask is not None else "JPEG")
        return {"image": base64.b64encode(stream.getvalue()).decode(), "illustrative": True,
                "model": EDIT_MODEL, "seed": seed, "edit_instruction": translated,
                "preservation": "outside-selection" if mask is not None else None}
