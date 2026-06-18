$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Install = "C:\Users\adam\Documents\Codex\AIWorkstreamMVP"

if (-not (Test-Path $Install)) {
  New-Item -ItemType Directory -Path $Install | Out-Null
}

Copy-Item -LiteralPath (Join-Path $Root "extension") -Destination $Install -Recurse -Force
Copy-Item -LiteralPath (Join-Path $Root "README.md") -Destination $Install -Force
Copy-Item -LiteralPath (Join-Path $Root "analyzer-server.js") -Destination $Install -Force
Copy-Item -LiteralPath (Join-Path $Root "start-analyzer.ps1") -Destination $Install -Force
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
  Copy-Item -LiteralPath $EnvFile -Destination $Install -Force
}

$Node = "C:\Users\adam\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $Node)) { $Node = "node" }

Get-CimInstance Win32_Process | Where-Object {
  $_.Name -like "node*" -and $_.CommandLine -like "*analyzer-server.js*"
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath $Node -ArgumentList "analyzer-server.js" -WorkingDirectory $Install -WindowStyle Hidden

Write-Host "Updated installed files: $Install"
Write-Host "If the extension is loaded in Chrome, reload it from chrome://extensions or restart the test Chrome."
