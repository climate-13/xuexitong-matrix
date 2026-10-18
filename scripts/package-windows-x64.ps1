[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Raw (Join-Path $root "config/build.json") | ConvertFrom-Json
$tauriConfig = Get-Content -Raw (Join-Path $root "src-tauri/tauri.conf.json") | ConvertFrom-Json
$exePath = Join-Path $root "target/release/$($config.app.name).exe"
$artifactPath = Join-Path (Split-Path -Parent $exePath) "$($config.app.artifact_prefix)-$($tauriConfig.version)-win-x64.exe"

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Release executable not found: $exePath"
}

Move-Item -LiteralPath $exePath -Destination $artifactPath -Force
Write-Output "Created $artifactPath"
