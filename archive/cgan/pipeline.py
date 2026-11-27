"""Run from ai-worker: python -m cgan.pipeline --help."""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from torch import nn
from torch.utils.data import DataLoader
from safetensors.torch import save_file, load_file
from .data import read_manifest, GarmentDataset
from .model import Generator, Discriminator, masked_l1

ENCODER = "Marqo/marqo-fashionCLIP"

def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def encode(prompts):
    # Frozen existing local pretrained encoder; the GAN itself starts untrained.
    from local_engine import clip_model
    model,_,tokenizer = clip_model()
    with torch.inference_mode():
        embedding = model.encode_text(tokenizer(prompts))
        return torch.nn.functional.normalize(embedding.float(),dim=-1).cpu()

def prepare(args):
    records = read_manifest(args.manifest,args.dataset)
    features = {}
    for start in range(0,len(records),16):
        batch = records[start:start+16]
        vectors = encode([r["prompt_en"] for r in batch])
        features.update({r["id"]:vector.clone() for r,vector in zip(batch,vectors)})
    output = Path(args.embeddings)
    output.parent.mkdir(parents=True,exist_ok=True)
    torch.save({"encoder":ENCODER,"manifest_sha256":digest(args.manifest),"features":features},output)
    print(json.dumps({"samples":len(records),"text_dim":next(iter(features.values())).numel(),"encoder":ENCODER}))

def data(args,split):
    records = read_manifest(args.manifest,args.dataset)
    cache = torch.load(args.embeddings,map_location="cpu",weights_only=True)
    if cache["encoder"] != ENCODER or cache["manifest_sha256"] != digest(args.manifest):
        raise ValueError("Manifest/encoder berbeda dari cache. Jalankan prepare kembali")
    records = [r for r in records if r["split"] == split]
    if not records: raise ValueError(f"Split {split} kosong")
    if any(r["id"] not in cache["features"] for r in records): raise ValueError("Embedding tidak lengkap")
    return records,cache["features"]

def train_step(generator,discriminator,batch,opt_g,opt_d,l1_weight=50):
    source,target,mask,text = batch
    noise = torch.randn(len(source),generator.noise_dim,device=source.device)
    generated = generator(source,mask,text,noise)
    loss = nn.BCEWithLogitsLoss()
    opt_d.zero_grad(set_to_none=True)
    real = discriminator(source,target,mask,text)
    fake = discriminator(source,generated.detach(),mask,text)
    d_loss = (loss(real,torch.ones_like(real))+loss(fake,torch.zeros_like(fake)))/2
    if len(source) > 1:
        # Matching-aware negative pairs; identical/synonymous embeddings excluded.
        wrong = text.roll(1,0)
        different = torch.nn.functional.cosine_similarity(text,wrong) < .99
        if different.any():
            mismatch = discriminator(source[different],target[different],mask[different],wrong[different])
            d_loss += .5*loss(mismatch,torch.zeros_like(mismatch))
    d_loss.backward()
    opt_d.step()
    for p in discriminator.parameters(): p.requires_grad_(False)
    opt_g.zero_grad(set_to_none=True)
    fake = discriminator(source,generated,mask,text)
    reconstruction = masked_l1(generated,target,mask)
    g_loss = loss(fake,torch.ones_like(fake))+l1_weight*reconstruction
    if not torch.isfinite(g_loss+d_loss): raise ValueError("Loss tidak finite; pelatihan dihentikan")
    g_loss.backward()
    opt_g.step()
    for p in discriminator.parameters(): p.requires_grad_(True)
    return {"generator":float(g_loss.detach()),"discriminator":float(d_loss.detach()),"masked_l1":float(reconstruction.detach())}

def train(args):
    torch.manual_seed(args.seed)
    records,features = data(args,"train")
    out = Path(args.output)
    if out.exists() and any(out.iterdir()) and not args.resume:
        raise ValueError("Folder output berisi data; gunakan folder baru atau --resume")
    out.mkdir(parents=True,exist_ok=True)
    device = torch.device(args.device)
    config = {"text_dim":next(iter(features.values())).numel(),"noise_dim":32,"base":args.base}
    generator,discriminator = Generator(**config).to(device),Discriminator(text_dim=config["text_dim"],base=args.base).to(device)
    opt_g = torch.optim.Adam(generator.parameters(),lr=args.lr,betas=(.5,.999))
    opt_d = torch.optim.Adam(discriminator.parameters(),lr=args.lr,betas=(.5,.999))
    first,steps = 0,0
    if args.resume:
        saved = torch.load(out/"training.pt",map_location=device,weights_only=True)
        if saved["config"] != config or saved["manifest_sha256"] != digest(args.manifest) or saved["size"] != args.size:
            raise ValueError("Konfigurasi/manifest resume berbeda")
        generator.load_state_dict(saved["generator"]); discriminator.load_state_dict(saved["discriminator"])
        opt_g.load_state_dict(saved["opt_g"]); opt_d.load_state_dict(saved["opt_d"])
        first,steps = saved["epoch"],saved["steps"]
    loader = DataLoader(GarmentDataset(records,args.dataset,features,args.size),batch_size=args.batch,shuffle=True,num_workers=0)
    for epoch in range(first,args.epochs):
        for batch in loader:
            losses = train_step(generator,discriminator,[x.to(device) for x in batch],opt_g,opt_d,args.l1_weight)
            steps += 1
        meta = {"generator_variant":"residual-v1","architecture":"Rupa experimental text-conditioned U-Net + matching-aware PatchGAN", "config":config,
            "size":args.size,"epoch":epoch+1,"steps":steps,"encoder":ENCODER,"manifest_sha256":digest(args.manifest),
            "trained_tasks":sorted({r["task"] for r in records}),"train_garment_ids":sorted({r["garment_id"] for r in records}),
            "train_target_hashes":sorted({r["_target_sha256"] for r in records}),"samples":len(records),"last_training_losses":losses,
            "customer_ready":False,"note":"Training completed steps are not evidence of garment editing quality; held-out and human evaluation required."}
        save_file({k:v.detach().cpu().contiguous() for k,v in generator.state_dict().items()},str(out/"generator.pending.safetensors"))
        (out/"generator.pending.safetensors").replace(out/"generator.safetensors")
        (out/"metadata.pending.json").write_text(json.dumps(meta,indent=2),encoding="utf-8")
        (out/"metadata.pending.json").replace(out/"metadata.json")
        torch.save({"generator":generator.state_dict(),"discriminator":discriminator.state_dict(),"opt_g":opt_g.state_dict(),"opt_d":opt_d.state_dict(),
            "epoch":epoch+1,"steps":steps,"config":config,"size":args.size,"manifest_sha256":digest(args.manifest)},out/"training.pending.pt")
        (out/"training.pending.pt").replace(out/"training.pt")
        print(json.dumps({"epoch":epoch+1,"steps":steps,**losses}),flush=True)

def load_generator(folder,device):
    folder = Path(folder)
    meta = json.loads((folder/"metadata.json").read_text(encoding="utf-8"))
    if meta.get("steps",0) < 1 or meta.get("encoder") != ENCODER:
        raise ValueError("Checkpoint belum dilatih atau encoder tidak sesuai")
    generator = Generator(**meta["config"]).to(device)
    generator.load_state_dict(load_file(str(folder/"generator.safetensors"),device=str(device)))
    return generator.eval(),meta

def evaluate(args):
    records,features = data(args,args.split)
    generator,meta = load_generator(args.checkpoint,torch.device(args.device))
    if any(r["garment_id"] in meta["train_garment_ids"] or r["_target_sha256"] in meta["train_target_hashes"] for r in records):
        raise ValueError("Evaluasi memakai pakaian/gambar yang pernah dilatih")
    loader = DataLoader(GarmentDataset(records,args.dataset,features,meta["size"]),batch_size=1)
    torch.manual_seed(args.seed)
    rows = []
    from PIL import Image,ImageDraw
    review_dir=Path(args.report).parent/(Path(args.report).stem+"-images")
    review_dir.mkdir(parents=True,exist_ok=True)
    with torch.no_grad():
        for record,batch in zip(records,loader):
            source,target,mask,text = [x.to(args.device) for x in batch]
            generated = generator(source,mask,text,torch.randn(1,generator.noise_dim,device=args.device))
            sample={"id":record["id"],"task":record["task"],"masked_l1":float(masked_l1(generated,target,mask)),
                "identity_baseline_l1":float(masked_l1(source,target,mask)),
                "outside_mask_max_error":float(((generated-source).abs()*(1-mask)).max()) if record["task"] == "edit" else None}
            rows.append(sample)
            tile=Image.new("RGB",(768,242),"white");draw=ImageDraw.Draw(tile)
            for i,(tensor,label) in enumerate([(source,"Source"),(mask.repeat(1,3,1,1)*2-1,"Mask"),(target,"Target"),(generated,"cGAN result")]):
                array=((tensor[0].cpu().clamp(-1,1).permute(1,2,0)+1)*127.5).round().byte().numpy()
                tile.paste(Image.fromarray(array).resize((192,192)),(i*192,20));draw.text((i*192+4,3),label,fill="black")
            label=(record["id"]+" | "+record["prompt_en"]).encode("ascii","replace").decode()[:110]
            draw.text((4,216),label,fill="black")
            tile.save(review_dir/(record["id"]+".png"))
    report = {"split":args.split,"samples":rows,"mean_masked_l1":sum(r["masked_l1"] for r in rows)/len(rows),
        "mean_identity_baseline_l1":sum(r["identity_baseline_l1"] for r in rows)/len(rows),
        "review_images":str(review_dir),
        "customer_ready":False,"limitations":"L1/pixel preservation do not measure text understanding, realism, diversity, or sewing feasibility. Human review required."}
    Path(args.report).write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"samples":len(rows),"mean_masked_l1":report["mean_masked_l1"]}))

def main():
    parser = argparse.ArgumentParser(description="Experimental local clothing cGAN dataset and training pipeline")
    sub = parser.add_subparsers(dest="command",required=True)
    for command in ("validate","prepare","train","evaluate"):
        p = sub.add_parser(command)
        p.add_argument("--dataset",required=True)
        p.add_argument("--manifest",required=True)
        if command != "validate": p.add_argument("--embeddings",required=True)
        if command in ("train","evaluate"):
            p.add_argument("--device",choices=["cpu","cuda"],default="cpu")
            p.add_argument("--seed",type=int,default=42)
        if command == "train":
            p.add_argument("--output",required=True)
            p.add_argument("--epochs",type=int,default=20)
            p.add_argument("--size",type=int,choices=[64,128,256],default=128)
            p.add_argument("--base",type=int,choices=[16,32,64],default=32)
            p.add_argument("--batch",type=int,default=4)
            p.add_argument("--lr",type=float,default=.0002)
            p.add_argument("--l1-weight",type=float,default=50)
            p.add_argument("--resume",action="store_true")
        if command == "evaluate":
            p.add_argument("--checkpoint",required=True)
            p.add_argument("--split",choices=["val","test"],default="val")
            p.add_argument("--report",required=True)
    args = parser.parse_args()
    torch.set_num_threads(4)
    if args.command == "validate":
        records = read_manifest(args.manifest,args.dataset)
        print(json.dumps({"valid":True,"samples":len(records),"tasks":sorted({r["task"] for r in records})}))
    elif args.command == "prepare": prepare(args)
    elif args.command == "train":
        if args.epochs < 1 or args.batch < 1 or args.lr <= 0 or args.l1_weight < 0:
            parser.error("epochs, batch, lr harus positif; l1-weight tidak boleh negatif")
        train(args)
    else: evaluate(args)

if __name__ == "__main__": main()
