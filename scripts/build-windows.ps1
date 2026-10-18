param([switch]$SkipTests, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))

if (-not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Install Visual Studio C++ Build Tools and a Windows SDK first.' }
    $install = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $install) { throw 'MSVC C++ tools were not found.' }
    $dev = Join-Path $install 'Common7/Tools/VsDevCmd.bat'
    $lines = & $env:ComSpec /s /c ('""' + $dev + '" -arch=x64 -host_arch=x64 >nul && set"')
    foreach ($line in $lines) { if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2],'Process') } }
}
function Check-Exit([string]$step) { if ($LASTEXITCODE -ne 0) { throw "$step failed ($LASTEXITCODE)" } }
pnpm build
Check-Exit 'Frontend build'
if (-not $SkipTests) {
    pnpm exec vitest run --fileParallelism false
    Check-Exit 'Frontend tests'
    cargo test --release --workspace --locked --features tauri/custom-protocol
    Check-Exit 'Rust tests'
}
if ($CheckOnly) { exit 0 }
cargo build --release --locked --features tauri/custom-protocol --bin sk-matrix
Check-Exit 'Windows executable'
$build = Get-Content -LiteralPath config/build.json -Raw | ConvertFrom-Json
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $PWD 'target' }
$release = Join-Path $PWD 'release'
New-Item -ItemType Directory -Path $release -Force | Out-Null
$exe = Join-Path $release "$($build.app.artifact_prefix)-$($build.version)-win-x64.exe"
Copy-Item -LiteralPath (Join-Path $target 'release/sk-matrix.exe') -Destination $exe
Copy-Item -LiteralPath LICENSE,NOTICE -Destination $release
Copy-Item -LiteralPath docs/USAGE.md -Destination (Join-Path $release '使用说明.md')
"$((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower())  $([IO.Path]::GetFileName($exe))" |
    Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt') -Encoding ascii
Write-Output "Created $exe"
