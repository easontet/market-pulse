$ErrorActionPreference = 'Stop'
$taskUrl = 'http://127.0.0.1:4188'
try {
    $taskHealth = Invoke-RestMethod "$taskUrl/api/health" -TimeoutSec 2
    if ($taskHealth.app -ne 'market-pulse-local') { throw 'Port occupied by another app' }
} catch {
    $taskNode = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $taskNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    $taskReady = $false
    for ($taskTry = 0; $taskTry -lt 20; $taskTry++) {
        Start-Sleep -Milliseconds 250
        try { $taskHealth = Invoke-RestMethod "$taskUrl/api/health" -TimeoutSec 1; if ($taskHealth.app -eq 'market-pulse-local') { $taskReady = $true; break } } catch {}
    }
    if (-not $taskReady) { throw 'Server failed to start. Check whether port 4188 is occupied.' }
}
Start-Process $taskUrl
Write-Host "Market Pulse is running at $taskUrl"
