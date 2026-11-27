param([int]$Port = 3050)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$rupaListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($rupaListener) {
    $rupaOwner = Get-CimInstance Win32_Process -Filter "ProcessId = $($rupaListener.OwningProcess)"
    $rupaCommand = ([string]$rupaOwner.CommandLine).Replace('/', '\')
    $rupaNextProcess = $rupaCommand.Contains('node_modules\next\dist\bin\next')
    $rupaWebHealthy = $false
    if ($rupaNextProcess) {
        try {
            $rupaResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/state" -TimeoutSec 5 -UseBasicParsing
            $rupaState = $rupaResponse.Content | ConvertFrom-Json
            $rupaWebHealthy = $rupaResponse.StatusCode -eq 200 -and $null -ne $rupaState.integrations -and $null -ne $rupaState.shops -and $rupaState.mode -in @('demo', 'supabase')
        } catch { }
    }
    if ($rupaNextProcess -and $rupaWebHealthy) {
        Write-Host "Aplikasi Rupa sudah aktif: http://127.0.0.1:$Port (PID $($rupaListener.OwningProcess))."
        return
    }
    throw "Port $Port dipakai proses PID $($rupaListener.OwningProcess). Layanan Rupa belum dapat dikonfirmasi sehat. Tidak ada proses yang dihentikan."
}
$rupaNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($rupaNodeCommand) {
    $rupaNodePath = $rupaNodeCommand.Source
} else {
    $rupaNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $rupaNodePath)) { throw 'Node.js 24+ belum tersedia. Instal Node dan jalankan pnpm install.' }
$rupaNextPath = Join-Path $PSScriptRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $rupaNextPath)) { throw 'Dependency belum dipasang. Jalankan pnpm install.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.next\BUILD_ID'))) {
    & $rupaNodePath $rupaNextPath build --webpack
    if ($LASTEXITCODE -ne 0) { throw 'Build gagal.' }
}
& $rupaNodePath $rupaNextPath start --hostname 127.0.0.1 --port $Port
