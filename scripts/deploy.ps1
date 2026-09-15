# Deploys (or updates) the production stack on the droplet from Windows. Nothing is built on the server: the API
# image is pulled from GHCR (build it with the release workflow first). Run it yourself:
#
#   powershell -File scripts/deploy.ps1                 # latest image
#   powershell -File scripts/deploy.ps1 -Tag 1.0.0      # a released version
#
# One-time server preparation (Docker, swap, /etc/menu-kopilot/env, GHCR login) is described in README.md.
param(
  [string]$SshHost = 'myserver',
  [string]$Tag = 'latest',
  [string]$RemoteDir = '/srv/menu-kopilot'
)

$ErrorActionPreference = 'Stop'
$deployDir = Join-Path (Join-Path $PSScriptRoot '..') 'deploy'
$compose = "docker compose --env-file /etc/menu-kopilot/env -f $RemoteDir/docker-compose.prod.yml"

function Invoke-Remote([string]$Command) {
  ssh $SshHost $Command
  if ($LASTEXITCODE -ne 0) { throw "remote command failed ($LASTEXITCODE): $Command" }
}

Write-Output "==> Checking the server ($SshHost)"
Invoke-Remote 'test -f /etc/menu-kopilot/env || { echo "missing /etc/menu-kopilot/env (see README)"; exit 1; }'
Invoke-Remote "mkdir -p $RemoteDir"

Write-Output '==> Uploading compose file and Caddyfile (LF line endings)'
foreach ($name in @('docker-compose.prod.yml', 'Caddyfile')) {
  $text = [System.IO.File]::ReadAllText((Join-Path $deployDir $name)).Replace("`r`n", "`n")
  $temp = Join-Path $env:TEMP "menu-kopilot-$name"
  [System.IO.File]::WriteAllText($temp, $text, (New-Object System.Text.UTF8Encoding($false)))
  scp $temp "${SshHost}:$RemoteDir/$name"
  if ($LASTEXITCODE -ne 0) { throw "scp failed for $name" }
  Remove-Item $temp
}
Invoke-Remote "chmod 644 $RemoteDir/docker-compose.prod.yml $RemoteDir/Caddyfile"

Write-Output "==> Pulling images (API tag: $Tag)"
Invoke-Remote "cd $RemoteDir && API_TAG=$Tag $compose pull"

Write-Output '==> Starting the stack (migrations + seed run when the API starts)'
Invoke-Remote "cd $RemoteDir && API_TAG=$Tag $compose up -d --remove-orphans"

Write-Output '==> Waiting for /health/ready'
$ready = $false
for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
  Start-Sleep -Seconds 4
  ssh $SshHost "cd $RemoteDir && $compose exec -T api wget -qO- http://127.0.0.1:3000/health/ready" 2>$null | Out-Null
  $ready = $LASTEXITCODE -eq 0
}
Invoke-Remote "cd $RemoteDir && $compose ps"
if (-not $ready) { throw 'API did not become ready; check: ssh myserver "docker logs --tail 100 menu-kopilot-api-1"' }
Write-Output '==> Ready. Old images can be removed with: ssh myserver "docker image prune -f"'
