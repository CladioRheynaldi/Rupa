"""Offline experimental inference from a trained cGAN checkpoint only."""
import argparse
import json
from pathlib import Path
import torch
from PIL import Image, ImageOps, PngImagePlugin
from .data import image_tensor
from .pipeline import encode, load_generator

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint",required=True)
    parser.add_argument("--task",choices=["edit","text_to_image"],required=True)
    parser.add_argument("--prompt-en",required=True)
    parser.add_argument("--before")
    parser.add_argument("--mask")
    parser.add_argument("--output",required=True)
    parser.add_argument("--device",choices=["cpu","cuda"],default="cpu")
    parser.add_argument("--seed",type=int,default=42)
    args = parser.parse_args()
    torch.set_num_threads(4)
    generator,meta = load_generator(args.checkpoint,torch.device(args.device))
    if args.task not in meta["trained_tasks"]:
        parser.error("Checkpoint belum dilatih untuk task tersebut")
    size = meta["size"]
    if args.task == "edit":
        if not args.before or not args.mask: parser.error("Edit memerlukan --before dan --mask")
        with Image.open(args.before) as im: original = ImageOps.exif_transpose(im).convert("RGB")
        with Image.open(args.mask) as im: original_mask = im.convert("L")
        if original.size != original_mask.size or not set(original_mask.tobytes()).issubset({0,255}) or not original_mask.getbbox():
            parser.error("Mask harus biner, tidak kosong, dan sama dimensi dengan foto")
        source,mask = image_tensor(original,size),image_tensor(original_mask,size,True)
    else:
        source,mask = torch.zeros(3,size,size),torch.ones(1,size,size)
    text = encode([args.prompt_en]).to(args.device)
    torch.manual_seed(args.seed)
    with torch.no_grad():
        output = generator(source[None].to(args.device),mask[None].to(args.device),text,
            torch.randn(1,generator.noise_dim,device=args.device))[0]
    image = Image.fromarray(((output.cpu().clamp(-1,1).permute(1,2,0)+1)*127.5).round().byte().numpy())
    if args.task == "edit":
        fitted = ImageOps.contain(original,(size,size))
        left,top = (size-fitted.width)//2,(size-fitted.height)//2
        generated = image.crop((left,top,left+fitted.width,top+fitted.height)).resize(original.size,Image.Resampling.LANCZOS)
        image = Image.composite(generated,original,original_mask)
    out = Path(args.output)
    out.parent.mkdir(parents=True,exist_ok=True)
    info = PngImagePlugin.PngInfo()
    info.add_text("Rupa status","Experimental cGAN output; quality unvalidated; not a sewing guarantee")
    image.save(out,format="PNG",pnginfo=info)
    out.with_suffix(".json").write_text(json.dumps({"experimental":True,"customer_ready":False,
        "task":args.task,"prompt_en":args.prompt_en,"seed":args.seed,"checkpoint_steps":meta["steps"]},indent=2),encoding="utf-8")
    print("Experimental result saved; assess realism and prompt adherence before any customer use.")

if __name__ == "__main__": main()
