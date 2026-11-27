import functools
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
@functools.lru_cache(maxsize=1)
def safety():
    import torch
    from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker
    from transformers import CLIPImageProcessor
    folder=ROOT/".local/models/preview"
    checker=StableDiffusionSafetyChecker.from_pretrained(folder/"safety_checker",local_files_only=True,use_safetensors=True,variant="fp16",torch_dtype=torch.float32).eval()
    processor=CLIPImageProcessor.from_pretrained(folder/"feature_extractor",local_files_only=True)
    return checker,processor
