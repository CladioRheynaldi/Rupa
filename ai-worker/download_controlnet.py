"""Pinned local SDXL Canny-small checkpoint; never loads remote Python code."""
from pathlib import Path
import os
os.environ.pop('HF_HUB_OFFLINE',None)
os.environ['HF_HUB_DISABLE_XET']='1'
from huggingface_hub import snapshot_download
root=Path(__file__).resolve().parents[1]/'.local/models/controlnet-sdxl-canny-small'
snapshot_download('diffusers/controlnet-canny-sdxl-1.0-small',revision='edd85f64c5f87dfb6d73762949d9daca16389518',local_dir=root,allow_patterns=['config.json','diffusion_pytorch_model.fp16.safetensors','README.md'])
print('ControlNet Canny-small ready:',root)
