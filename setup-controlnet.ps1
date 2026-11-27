$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskPython = Join-Path $taskRoot 'ai-worker\.venv-local\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run setup-sdxl.ps1 first to prepare the local AI environment.' }
& $taskPython -X utf8 (Join-Path $taskRoot 'ai-worker\download_controlnet_http.py')
if ($LASTEXITCODE -ne 0) { throw 'ControlNet download or checksum verification failed.' }
Write-Host 'ControlNet is ready. Start the local worker using .\start-ai.ps1.'
