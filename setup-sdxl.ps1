$ErrorActionPreference = 'Stop'
$rupaPython = Join-Path $PSScriptRoot 'ai-worker\.venv-local\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $rupaPython)) { throw 'Siapkan environment ai-worker terlebih dahulu.' }
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { throw 'Hentikan worker AI sebelum memasang CUDA.' }
Push-Location -LiteralPath $PSScriptRoot
try {
    & $rupaPython -m pip install --no-cache-dir --upgrade --force-reinstall --no-deps torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128
    if ($LASTEXITCODE -ne 0) { throw 'Pemasangan CUDA gagal.' }
    & $rupaPython -X utf8 ai-worker/download_sdxl.py
    if ($LASTEXITCODE -ne 0) { throw 'Unduhan belum selesai; jalankan ulang untuk melanjutkan.' }
    & $rupaPython -c "import torch; print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
} finally { Pop-Location }
