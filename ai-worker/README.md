# Rupa optional local AI worker

The web application runs independently from this private FastAPI worker. The active prototype uses Qwen/Qwen3.5-0.8B for optional analysis, SDXL Inpainting for illustrations, and ControlNet Canny-small for supported free-form edits. Structured pockets use a geometric draft plus SDXL, with ControlNet conditioning disabled.

## Restore the local inference environment

From the repository root, use a compatible Python installation (the tested environment used Python 3.13):

```powershell
py -3.13 -m venv ai-worker\.venv-local
.\ai-worker\.venv-local\Scripts\python.exe -m pip install -r ai-worker\requirements-local.txt
```

On a compatible NVIDIA GPU, `./setup-sdxl.ps1` installs the pinned CUDA PyTorch build and downloads SDXL. For CPU-only installation, retain a compatible CPU PyTorch build and invoke the SDXL downloader directly instead:

```powershell
.\ai-worker\.venv-local\Scripts\python.exe ai-worker\download_sdxl.py
```

Download the other models required by the existing local gateway and its image checker, then install ControlNet weights:

```powershell
.\ai-worker\.venv-local\Scripts\python.exe ai-worker\download_models.py
.\setup-controlnet.ps1
.\start-ai.ps1
```

`download_models.py` is the original pinned bundle downloader; it also retrieves older catalogue/preview components. Those components are not active customer-facing models, but the preview bundle provides the local image checker. The full bundle is large. Inspect the scripts before choosing to download it.

Weights are stored under `.local/models` at the repository root; virtual environments and downloaded files are excluded from Git. The original laptop weights, training data, checkpoints and AI environments were removed to save disk space. Installing this repository does not restore them automatically.

The worker reads or creates a private `AI_WORKER_TOKEN` in the ignored `.env.local`. Both the web app and worker must share it. Keep the worker bound to 127.0.0.1:8000 for local development. The web app checks `/health`; generation returns an error when the model files are unavailable, without returning a fabricated fallback image.

## API and design variants

Authenticated endpoints: `/analyze` and `/preview`; readiness: `/health`. The retired `/search` endpoint returns 410.

For structured pockets, `/preview` receives an original image, normalized pocket specification, and `variation_index` 0–2. The indices select classic open, flap without a button, and center-pleated construction. Each profile changes the prompt and guiding sketch, retaining color, outer shape, box and placement. Image outputs are identified as sketch-guided hybrid illustrations.

The original SDXL settings are 1024px, 40 scheduled steps, guidance 7.5 and denoising strength 0.55 for the structured pocket path. Pixels outside the allowed region are restored from the original photo. See [POCKET_EDITOR.md](POCKET_EDITOR.md).

Free-form edits remain less reliable. No SAM/YOLO body-part detection or photorealistic fit simulation is implemented. AI suggestions do not authorize physical tailoring.

## Tests

From this directory after restoring the environment:

```powershell
.\.venv-local\Scripts\python.exe -m unittest test_sdxl test_edit_mask test_pocket_layout
```

The 18 worker tests use mocked inference to verify contracts, variant construction, validation, error handling and mask preservation. They are distinct from the recorded real SDXL image-generation checks.

## cGAN archive

Historical experiment source is under `archive/cgan`. It is not used by the app. Its checkpoints and training images are not distributed; do not assume it can be selected as an active model.
