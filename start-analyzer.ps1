$ErrorActionPreference = "Stop"
$Node = "C:\Users\adam\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $Node)) {
  $Node = "node"
}
& $Node "$PSScriptRoot\analyzer-server.js"
