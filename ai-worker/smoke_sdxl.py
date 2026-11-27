"""Actual local smoke inference; does not write orders or send customer photos online."""
import os,base64,io,json,time,argparse
from pathlib import Path
os.environ["HF_HUB_OFFLINE"]="1"
os.environ["TRANSFORMERS_OFFLINE"]="1"
import torch
from PIL import Image,ImageChops
from server import Task
from sdxl_inpainting import preview
from inpainting import region_mask

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--image",required=True);parser.add_argument("--prompt",default="Tambahkan satu kantong tempel warna biru tua pada dada kiri kaos, jahitan rapi");parser.add_argument("--name",default="pocket");parser.add_argument("--details-test",action="store_true");parser.add_argument("--region",default=".56,.32,.19,.23");args=parser.parse_args()
    torch.set_num_threads(2)
    source=Path(args.image).resolve();root=Path(__file__).resolve().parents[1];folder=root/"outputs/sdxl-smoke";folder.mkdir(parents=True,exist_ok=True)
    task=Task(prompt=args.prompt,engine="sdxl",image=base64.b64encode(source.read_bytes()).decode(),region=dict(zip(["x","y","width","height"],map(float,args.region.split(",")))),seed=42)
    if args.details_test:
        from server import DesignMarkup
        task.region=None
        task.markup=DesignMarkup(details=[{"id":"collar","text":"Ubah kerah bulat menjadi kerah V warna merah","x":.5,"y":.12},{"id":"logo","text":"Tambahkan satu logo berbentuk lingkaran putih polos di dada kanan kaos","x":.37,"y":.38}],strokes=[
            {"tool":"draw","detailId":"collar","width":.06,"points":[[.38,y],[.62,y]]} for y in [.04,.09,.14,.19]]+[
            {"tool":"draw","detailId":"logo","width":.06,"points":[[.31,y],[.43,y]]} for y in [.32,.37,.42]])
    start=time.monotonic();result=preview(task)
    original=Image.open(source).convert("RGB");final=Image.open(io.BytesIO(base64.b64decode(result["image"]))).convert("RGB")
    from edit_mask import stroke_mask
    mask=stroke_mask(original.size,task.markup) if task.markup else region_mask(original.size,task.region);diff=ImageChops.difference(original,final).convert("L")
    assert ImageChops.multiply(diff,ImageChops.invert(mask)).getbbox() is None,"Unexpected changes outside selected region"
    assert diff.getbbox() is not None,"No image change"
    final.save(folder/(args.name+"-after.png"));original.save(folder/(args.name+"-before.png"))
    report={"model":result["model"],"device":torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu","seconds":round(time.monotonic()-start,1),"instruction":result["edit_instruction"],"outside_pixels_identical":True,"semantic_quality":"Requires visual review"}
    (folder/(args.name+"-report.json")).write_text(json.dumps(report,indent=2),encoding="utf-8");print(json.dumps(report),flush=True)
if __name__=="__main__":main()
