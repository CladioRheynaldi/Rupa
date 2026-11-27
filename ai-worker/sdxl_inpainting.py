"""Pretrained SDXL regional editing; preserves all pixels outside the selection."""
import base64,functools,gc,io,secrets,re,os,json
from pathlib import Path
from PIL import Image,ImageOps
from preview_errors import PreviewFailure
MODEL="diffusers/stable-diffusion-xl-1.0-inpainting-0.1"
ROOT=Path(__file__).resolve().parents[1]/".local/models/sdxl-inpaint"
REQUIRED=["model_index.json","unet/diffusion_pytorch_model.fp16.safetensors","vae/diffusion_pytorch_model.fp16.safetensors","text_encoder/model.fp16.safetensors","text_encoder_2/model.fp16.safetensors"]
CONTROL_MODEL="diffusers/controlnet-canny-sdxl-1.0-small"
CONTROL_ROOT=ROOT.parent/"controlnet-sdxl-canny-small"
def controlnet_ready():return all((CONTROL_ROOT/f).is_file() for f in ["config.json","diffusion_pytorch_model.fp16.safetensors"])
def ready():return all((ROOT/f).is_file() for f in REQUIRED)

@functools.lru_cache(maxsize=1)
def pipeline():
    import torch
    from diffusers import StableDiffusionXLControlNetInpaintPipeline,ControlNetModel
    if not controlnet_ready():raise PreviewFailure("CONTROLNET_NOT_READY")
    dtype=torch.float16 if torch.cuda.is_available() else torch.float32
    control=ControlNetModel.from_pretrained(CONTROL_ROOT,local_files_only=True,variant="fp16",use_safetensors=True,torch_dtype=dtype)
    pipe=StableDiffusionXLControlNetInpaintPipeline.from_pretrained(ROOT,controlnet=control,local_files_only=True,variant="fp16",use_safetensors=True,torch_dtype=dtype)
    if torch.cuda.is_available():
        free,_=torch.cuda.mem_get_info()
        if free < 6500*1024**2:
            pipe.enable_sequential_cpu_offload()
        else:pipe.enable_model_cpu_offload()
    else:pipe.to("cpu")
    pipe.vae.enable_slicing();pipe.vae.enable_tiling()
    return pipe

def control_image(image,mask,description=""):
    import cv2,numpy as np
    edges=cv2.Canny(np.asarray(image.convert("RGB")),100,200)
    # Existing edges inside the target would prevent adding a new shape.
    edges[np.asarray(mask)>0]=0
    if re.search(r"\b(?:rectangular|square)\b",description,re.I) and re.search(r"\b(?:pocket)\b",description,re.I):
        # A geometry prior for the explicitly requested rectangular pocket.
        # Only the conditioning map is drawn; returned pixels come from SDXL.
        bounds=mask.getbbox()
        if bounds:
            x0,y0,x1,y1=bounds;w=x1-x0;h=y1-y0
            left=round(x0+w*.16);right=round(x1-w*.16)
            top=round(y0+h*.15);bottom=round(y1-h*.15)
            hem=round(top+h*.065)
            guide=np.zeros_like(edges)
            cv2.rectangle(guide,(left,top),(right,bottom),255,2)
            cv2.line(guide,(left,hem),(right,hem),255,2)
            edges=np.maximum(edges,np.where(np.asarray(mask)>0,guide,0).astype('uint8'))
    return Image.fromarray(np.repeat(edges[:,:,None],3,axis=2))

def detail_tasks(task):
    if getattr(task,"generation","inpaint")=="text":
        yield 1,task.prompt,None
        return
    if task.markup and task.markup.details:
        for i,d in enumerate(task.markup.details):
            strokes=[s for s in task.markup.strokes if s.tool=="erase" or s.detailId==d.id]
            if d.pocket:
                if not d.pocket.confirmed:raise PreviewFailure("INVALID_EDIT_AREA",i+1)
            elif len(d.text.strip())<5 or not any(s.tool=="draw" for s in strokes):raise PreviewFailure("INVALID_EDIT_AREA",i+1)
            yield i+1,d.text,task.markup.model_copy(update={"strokes":strokes,"details":[d] if d.pocket else []})
    else:yield 1,task.prompt,task.markup

def generation_prompt(description):
    # Diffusion expects the desired appearance, not an imperative editing command.
    visual=re.sub(r"^(?:please\s+)?(?:add|create|insert|put|make)\s+", "", description.strip(), flags=re.I)
    prompt="Product photograph of "+visual+", realistic fabric texture"
    negative="blurry, distorted, watermark, extra limbs, nudity"
    if re.search(r"\bpocket\b",visual,re.I):
        # Separate the requested object from preservation instructions. Repeating
        # "keep the red shirt" in the object prompt can turn a navy pocket red.
        appearance=re.split(r"\b(?:keep|preserve|maintain|retain)\b",visual,flags=re.I)[0].strip(' ,.')
        color="navy blue" if re.search(r"\b(?:navy|dark blue)\b",appearance,re.I) else None
        if color and re.search(r"\b(?:rectangular|square)\b",appearance,re.I):
            garment="a red T-shirt" if re.search(r"\bred\s+(?:t-?shirt|shirt)\b",visual,re.I) else "the existing garment"
            prompt=("Product photo, one navy blue fabric patch pocket sewn onto "+garment+". "
                    "The rectangular navy pocket has an open top, folded top hem, "
                    "fine stitching along two sides and bottom, soft fabric shadows. Empty pocket, plain design.")
            negative+=", red pocket, white pocket, white panel, printed pocket, drawing, sketch, badge, fabric sample, white frame, glue, paper, pins, clips, tape, button, extra pockets, zipper, cutout"
        else:
            prompt="Close-up garment photograph with ("+appearance+":1.3), sewn fabric patch pocket, open top hem, realistic cloth texture, visible stitching"
            negative+=", outline drawing, diagram, sketch, transparent pocket"
    if re.search(r"\b(?:logo|emblem|print)\b",visual,re.I) and not re.search(r"\bpocket\b",visual,re.I):
        negative+=", pocket, patch pocket"
    return prompt,negative

def preview(task):
    from local_engine import LOCK
    import torch
    with LOCK:
        try:return _preview(task)
        finally:
            # Release large weights between requests on a shared 16 GB laptop.
            pipeline.cache_clear()
            gc.collect()
            if torch.cuda.is_available():torch.cuda.empty_cache()

def _preview(task):
    import numpy as np
    import torch
    from local_engine import LOCK,image_from,generate,vision_model,edit_model
    from edit_mask import stroke_mask,crop_context,composite_strokes
    from inpainting import region_mask
    from image_safety import safety
    with LOCK:
        if not ready():raise PreviewFailure("MODEL_NOT_READY")
        from local_engine import clip_model
        clip_model.cache_clear()
        gc.collect()
        concept=getattr(task,"generation","inpaint")=="text"
        original=Image.new("RGB",(768,768),"white") if concept else image_from(task.image)
        current=original.copy();instructions=[]
        layout_used=False
        seed=task.seed if task.seed is not None else secrets.randbelow(2**31)
        edits=[]
        from pocket_layout import STYLES,STYLE_LABELS
        style=STYLES[getattr(task,'variation_index',0)]
        for number,description,markup in detail_tasks(task):
            spec=markup.details[0].pocket if markup and markup.details and markup.details[0].pocket else None
            from pocket_layout import pocket_prompt
            prompt=pocket_prompt(spec,style) if spec else generate("Translate into ONE concise English visual description of the requested clothing detail after editing. Keep colors, position and motif, do not add unrelated changes. Example: tambahkan kantong -> a sewn fabric patch pocket. Request: "+description,max_tokens=85)
            if not prompt:raise PreviewFailure("PROMPT_TRANSLATION_FAILED",number)
            edits.append((number,prompt,markup,spec))
        vision_model.cache_clear();edit_model.cache_clear()
        clip_model.cache_clear()
        gc.collect()
        if torch.cuda.is_available():torch.cuda.empty_cache()
        for number,prompt,markup,spec in edits:
            mask=Image.new("L",original.size,255) if concept else stroke_mask(original.size,markup) if markup else region_mask(original.size,task.region) if task.region else None
            if spec:
                from pocket_layout import pocket_mask
                mask=pocket_mask(original.size,spec)
            if mask is None or not mask.getbbox():raise PreviewFailure("INVALID_EDIT_AREA",number)
            crop,box=crop_context(current,mask);cropped_mask=mask.crop(box)
            # Pad rather than stretch the garment. Remove padding before composition.
            size=1024 if spec or os.getenv("RUPA_SDXL_NATIVE_RESOLUTION")=="1" else 768
            fitted=ImageOps.contain(crop,(size,size));left=(size-fitted.width)//2;top=(size-fitted.height)//2
            source=Image.new("RGB",(size,size));source.paste(fitted,(left,top))
            padded_mask=Image.new("L",(size,size));padded_mask.paste(cropped_mask.resize(fitted.size,Image.Resampling.NEAREST),(left,top))
            positive,negative=generation_prompt(prompt)
            if spec:
                # Keep the explicit design variant out of the legacy pocket rewrite.
                positive='Product photograph of '+pocket_prompt(spec,style)
                negative='blurry, distorted, watermark, printed badge, patch logo, drawing, sketch, extra pockets, zipper, button, glue, paper, clips'
            # Remove the old fabric's colour from the editable latent input.
            # This is a neutral hole, not a drawn replacement object; diffusion
            # must still generate the requested detail from noise and text.
            inference_source=source if concept else Image.composite(Image.new("RGB",source.size,(127,127,127)),source,padded_mask)
            from pocket_layout import applicable,conditioning_sketch
            use_layout=bool(spec) or (not concept and applicable(prompt))
            if use_layout:
                render_box=None
                if spec:
                    b=spec.box;sx=fitted.width/crop.width;sy=fitted.height/crop.height
                    render_box=(left+(b.x*original.width-box[0])*sx,top+(b.y*original.height-box[1])*sy,left+((b.x+b.width)*original.width-box[0])*sx,top+((b.y+b.height)*original.height-box[1])*sy)
                inference_source=conditioning_sketch(source,padded_mask,spec,render_box,style if spec else 'classic')
                layout_used=True
            pipe=None
            try:
                pipe=pipeline()
                with torch.inference_mode():
                    guided_pocket=not concept and bool(re.search(r"\b(?:rectangular|square)\b",prompt,re.I) and re.search(r"\bpocket\b",prompt,re.I))
                    no_control=bool(spec) or os.getenv("RUPA_SDXL_NO_CONTROL")=="1"
                    output=pipe(prompt=positive,negative_prompt=negative,image=inference_source if use_layout else source if no_control else inference_source,mask_image=padded_mask,control_image=control_image(source,padded_mask,prompt if guided_pocket else ""),controlnet_conditioning_scale=0.0 if concept or no_control else .55 if guided_pocket else .3,control_guidance_end=.7,height=size,width=size,num_inference_steps=40 if size==1024 else 32,guidance_scale=7.5 if size==1024 else 9.0,strength=.55 if use_layout else .99,generator=torch.Generator(device="cpu").manual_seed((seed+number-1)%(2**31)))
            except torch.cuda.OutOfMemoryError as exc:
                if pipe:pipe.maybe_free_model_hooks()
                torch.cuda.empty_cache();raise PreviewFailure("GPU_MEMORY",number) from exc
            edited=output.images[0].crop((left,top,left+fitted.width,top+fitted.height))
            debug=os.getenv("RUPA_INPAINT_DEBUG_DIR")
            if debug:
                debug_root=Path(debug);debug_root.mkdir(parents=True,exist_ok=True)
                prefix=f"{seed}-{number}"
                source.save(debug_root/(prefix+"-source.png"))
                if use_layout:inference_source.save(debug_root/(prefix+"-conditioning-sketch.png"))
                padded_mask.save(debug_root/(prefix+"-mask.png"))
                output.images[0].save(debug_root/(prefix+"-raw.png"))
                (debug_root/(prefix+"-prompt.json")).write_text(json.dumps({"positive":positive,"negative":negative,"box":box},indent=2),encoding="utf-8")
            current=composite_strokes(current,edited,box,mask)
            pipe.maybe_free_model_hooks()
            # SDXL does not ship this checker: retain the existing local checker.
            checker,processor=safety()
            with torch.inference_mode():
                _,flags=checker(clip_input=processor(images=current,return_tensors="pt").pixel_values,images=np.array([np.asarray(current).astype(np.float32)/255]))
            if any(flags):raise PreviewFailure("IMAGE_CHECK_REJECTED",number)
            instructions.append(prompt)
        stream=io.BytesIO();current.save(stream,format="PNG")
        return {"image":base64.b64encode(stream.getvalue()).decode(),"model":MODEL+(" (sketch-guided hybrid)" if layout_used else " (text concept via full-canvas inpainting)" if concept else " (ControlNet disabled)" if os.getenv("RUPA_SDXL_NO_CONTROL")=="1" else " + "+CONTROL_MODEL),"method":"procedural-layout-plus-diffusion" if layout_used else "diffusion-inpainting","illustrative":True,"seed":seed,"edit_instruction":" | ".join(instructions),"preservation":"full-concept" if concept else "outside-selection","variant_label":STYLE_LABELS[style] if any(e[3] for e in edits) else None}
