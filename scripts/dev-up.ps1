<#
.SYNOPSIS
  One command for a local Menu Kopilot session: Docker engine, the compose stack (Postgres, Redis, API) and the USB
  bridge for a connected Android phone.

.DESCRIPTION
  1. Starts Docker Desktop when the engine does not answer. With -FixDockerSocket it first stops Docker Desktop and
     moves %LOCALAPPDATA%\Docker\run aside: a stale sailor-ingest.sock there keeps the engine from starting and cannot
     be deleted (D-132). Docker recreates the folder.
  2. docker compose up -d (-Build also rebuilds the API image) and waits for /health/ready.
  3. adb reverse tcp:<port> tcp:<port> for every connected phone, so the app reaches http://localhost:<port>.

  The API port comes from API_PORT in the repository's .env (3000 when unset). Nothing else is read from .env.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Build
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -FixDockerSocket
#>
[CmdletBinding()]
param(
  [switch]$Build,
  [switch]$FixDockerSocket,
  [int]$Port = 0,
  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }

# Native tools print progress on stderr; Windows PowerShell 5.1 turns redirected stderr into errors under 'Stop'.
function Invoke-Native([string]$Exe, [string[]]$Arguments, [switch]$Quiet) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Quiet) { & $Exe @Arguments *> $null } else { & $Exe @Arguments 2>&1 | ForEach-Object { Write-Host "    $_" } }
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Test-Engine { (Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}') -Quiet) -eq 0 }

function Find-Adb {
  $onPath = Get-Command 'adb' -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  foreach ($sdk in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
    if (-not $sdk) { continue }
    $candidate = Join-Path $sdk 'platform-tools\adb.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

if ($Port -eq 0) {
  $Port = 3000
  $envFile = Join-Path $root '.env'
  if (Test-Path -LiteralPath $envFile) {
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*API_PORT\s*=\s*(\d+)\s*$' } | Select-Object -First 1
    if ($line -and $line -match '(\d+)\s*$') { $Port = [int]$Matches[1] }
  }
}

# 1. Docker engine ---------------------------------------------------------------------------------------------------
if ($FixDockerSocket) {
  Write-Step 'Stopping Docker Desktop and moving the stale socket folder aside (D-132)'
  [void](Invoke-Native 'docker' @('desktop', 'stop') -Quiet)
  $stopped = Wait-Until { -not (Get-Process -Name 'com.docker.backend' -ErrorAction SilentlyContinue) } 90
  if (-not $stopped) { throw 'Docker Desktop is still running; quit it from the tray icon and run this again.' }
  $run = Join-Path $env:LOCALAPPDATA 'Docker\run'
  if (Test-Path -LiteralPath $run) {
    $stale = 'run.stale-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Rename-Item -LiteralPath $run -NewName $stale
    Write-Host "    moved to $stale (safe to delete after a reboot)"
  }
}

if (-not (Test-Engine)) {
  Write-Step 'Starting Docker Desktop'
  if ((Invoke-Native 'docker' @('desktop', 'start') -Quiet) -ne 0) {
    $exe = @(
      (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $exe) { throw 'Docker Desktop is not installed.' }
    Start-Process -FilePath $exe
  }
  if (-not (Wait-Until { Test-Engine } $TimeoutSeconds)) {
    throw 'The Docker engine does not answer. If Docker Desktop hangs while starting, run again with -FixDockerSocket.'
  }
}
Write-Host '    Docker engine is up'

# 2. Stack -----------------------------------------------------------------------------------------------------------
Write-Step $(if ($Build) { 'Starting the stack and rebuilding the API image' } else { 'Starting the stack' })
$composeArgs = @('compose', 'up', '-d')
if ($Build) { $composeArgs += '--build' }
Push-Location $root
try {
  if ((Invoke-Native 'docker' $composeArgs) -ne 0) { throw 'docker compose up failed.' }
} finally {
  Pop-Location
}

$health = "http://127.0.0.1:$Port/health/ready"
Write-Step "Waiting for $health"
$ready = Wait-Until {
  try { (Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
} $TimeoutSeconds
if (-not $ready) { throw 'The API is not ready. Logs: docker compose logs api --tail 80' }
Write-Host '    API, database and Redis are ready'

# 3. Phone over USB --------------------------------------------------------------------------------------------------
$adb = Find-Adb
$phones = @()
if ($adb) {
  Write-Step 'Bridging USB phones (adb reverse)'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $phones = @(& $adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] })
  } finally {
    $ErrorActionPreference = $previous
  }
  foreach ($serial in $phones) {
    $code = Invoke-Native $adb @('-s', $serial, 'reverse', "tcp:$Port", "tcp:$Port") -Quiet
    if ($code -eq 0) { Write-Host "    $serial -> http://localhost:$Port" } else { Write-Host "    ${serial}: adb reverse failed" -ForegroundColor Yellow }
  }
  if ($phones.Count -eq 0) { Write-Host '    no phone connected (USB debugging on? accept the RSA prompt on the phone)' -ForegroundColor Yellow }
} else {
  Write-Host '    adb not found; install Android platform-tools to use a phone over USB' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Menu Kopilot is running.' -ForegroundColor Green
Write-Host "  API             http://127.0.0.1:$Port   (OpenAPI: /docs)"
Write-Host "  App server URL  http://localhost:$Port   (phone on USB, after the bridge above)"
Write-Host '  Stop            docker compose stop'
