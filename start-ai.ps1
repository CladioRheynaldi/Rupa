$ErrorActionPreference = 'Stop'
$rupaPython = Join-Path $PSScriptRoot 'ai-worker\.venv-local\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $rupaPython)) { throw 'Environment AI lokal belum dipasang. Baca ai-worker/README.md.' }
$rupaListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($rupaListener) {
    $rupaOwner = Get-CimInstance Win32_Process -Filter "ProcessId = $($rupaListener.OwningProcess)"
    $rupaCommand = ([string]$rupaOwner.CommandLine).Replace('/', '\')
    $rupaSameProject = $rupaCommand.IndexOf($PSScriptRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $rupaCommand.Contains('run_local.py')
    $rupaHealth = $null
    if ($rupaSameProject) {
        try { $rupaHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3 } catch { }
    }
    if ($rupaSameProject -and $rupaHealth.ok -eq $true -and $rupaHealth.local -eq $true) {
        Write-Host "AI Rupa sudah aktif pada http://127.0.0.1:8000 (PID $($rupaListener.OwningProcess))."
        Write-Host 'Tidak perlu menjalankan worker kedua. Buka aplikasi pada http://127.0.0.1:3050.'
        return
    }
    throw "Port 8000 dipakai proses PID $($rupaListener.OwningProcess). Worker Rupa dari proyek ini belum dapat dikonfirmasi sehat. Tidak ada proses yang dihentikan."
}
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'ai-worker')
try {
    & $rupaPython -X utf8 run_local.py
    if ($LASTEXITCODE -ne 0) { throw 'Worker AI berhenti dengan kesalahan. Periksa pesan di atas.' }
} finally {
    Pop-Location
}
