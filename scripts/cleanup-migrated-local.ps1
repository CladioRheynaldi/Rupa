param([switch]$Apply)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$migrationRef='hwvrlkcicnnalqvqrzwz'
$reportPath=Join-Path $taskRoot ".local\migrations\$migrationRef-report.json"
$sourcePath=Join-Path $taskRoot ".local\migrations\$migrationRef-source.json"
$report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
$live=Get-Content -LiteralPath (Join-Path $taskRoot 'outputs\supabase-live-verification.json') -Raw | ConvertFrom-Json
$source=Get-Content -LiteralPath $sourcePath -Raw | ConvertFrom-Json
$catalogue=Get-Content -LiteralPath (Join-Path $taskRoot 'public\references\PHOTO_DATASET_PROVENANCE.json') -Raw | ConvertFrom-Json
if($report.project -ne $migrationRef -or $report.verifiedFiles -ne ($source.assets.Count+$catalogue.images.Count)){throw 'Verified migration manifest does not match local data.'}
if($live.mode -ne 'supabase' -or $live.roles.Count -ne 4 -or @($live.roles | Where-Object {-not $_.login -or -not $_.catalogue}).Count -gt 0){throw 'Cloud application verification has not passed.'}
if(-not $live.privatePng -or -not $live.anonymousDenied -or -not $live.merchantPrivatePreviewDenied){throw 'Private file access verification has not passed.'}
$candidatePaths=[Collections.Generic.List[string]]::new()
foreach($asset in $source.assets){
 if($asset.id -notmatch '^[a-f0-9-]{36}$'){throw 'Unexpected asset identifier.'}
 $candidatePaths.Add((Join-Path $taskRoot ('.local\assets\'+$asset.id+'.jpg')))
}
foreach($photo in $catalogue.images){
 $fileName=[IO.Path]::GetFileName($photo.image)
 if($fileName -notmatch '^photo-[a-f0-9-]+\.jpg$'){throw 'Unexpected catalogue file name.'}
 $candidatePaths.Add((Join-Path $taskRoot ('public\references\'+$fileName)))
}
foreach($name in @('rupa.sqlite','rupa.sqlite-wal','rupa.sqlite-shm')){$candidatePaths.Add((Join-Path $taskRoot ('.local\'+$name)))}
$candidatePaths.Add($sourcePath)
$verifiedPaths=[Collections.Generic.List[string]]::new()
$bytes=0L
foreach($candidate in $candidatePaths){
 $resolved=[IO.Path]::GetFullPath($candidate)
 if(-not $resolved.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Cleanup target is outside the project.'}
 if(Test-Path -LiteralPath $resolved){
  $item=Get-Item -LiteralPath $resolved
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Cleanup only accepts ordinary verified files.'}
  $verifiedPaths.Add($resolved);$bytes+=$item.Length
 }
}
Write-Output ("Verified cleanup plan: {0} files, {1:N2} MiB. Model weights and cloud objects are excluded." -f $verifiedPaths.Count,($bytes/1MB))
if(-not $Apply){Write-Output 'Dry-run only; no files changed.';return}
foreach($verifiedPath in $verifiedPaths){Remove-Item -LiteralPath $verifiedPath -Force}
$result=@{project=$migrationRef;removedFiles=$verifiedPaths.Count;reclaimedBytes=$bytes;cloudDataPreserved=$true;modelWeightsPreserved=$true;finishedAt=[DateTime]::UtcNow.ToString('o')}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'outputs\supabase-local-cleanup.json') -Encoding utf8
Write-Output 'Verified migrated local copies removed. Cloud data and AI model weights remain available.'
