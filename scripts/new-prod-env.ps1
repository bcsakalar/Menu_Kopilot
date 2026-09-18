<#
.SYNOPSIS
  Writes .env.production for myserver with fresh random secrets (git-ignored, LF endings, UTF-8 without BOM).

.DESCRIPTION
  - POSTGRES_PASSWORD (hex, URL-safe: it goes into DATABASE_URL) and JWT_SECRET come from the cryptographic RNG.
  - ADMIN_PASSWORD is asked for with hidden input (at least 12 characters); it is the password you log in with.
  - GEMINI_API_KEY and GROQ_API_KEY are copied from the local .env when present. No secret is printed.
  Refuses to replace an existing .env.production unless -Force. Next: docs/DEPLOY_MYSERVER.md, section 2.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\new-prod-env.ps1 -AdminEmail admin@example.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AdminEmail,
  # Asked for with hidden input when omitted.
  [SecureString]$AdminPassword,
  [string]$AdminName = 'Uzman',
  [int]$ApiPort = 3030,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root '.env.production'
if ((Test-Path -LiteralPath $target) -and -not $Force) { throw '.env.production already exists; use -Force to replace it.' }
if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Not an e-mail address: $AdminEmail" }

# docker compose reads this file twice (--env-file for interpolation, env_file for the container): keep values free
# of characters it would interpret.
$unsafe = '[\s"''`$\\#]'
if ($AdminName -match '["''`$\\#]') { throw 'The admin name must not contain quotes, $, \, # or backticks.' }

function New-Hex([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Read-LocalValue([string]$Name) {
  $local = Join-Path $root '.env'
  if (-not (Test-Path -LiteralPath $local)) { return '' }
  $line = Get-Content -LiteralPath $local | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return ($line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$secure = if ($AdminPassword) { $AdminPassword } else { Read-Host -AsSecureString 'Admin password for the app (at least 12 characters, not the local one)' }
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($plainPassword.Length -lt 12) { throw 'The admin password needs at least 12 characters.' }
if ($plainPassword -match $unsafe) { throw 'Avoid spaces, quotes, $, \, # and backticks in the password.' }

$gemini = Read-LocalValue 'GEMINI_API_KEY'
$groq = Read-LocalValue 'GROQ_API_KEY'
foreach ($key in @($gemini, $groq)) { if ($key -match $unsafe) { throw 'An API key in .env contains unexpected characters.' } }

$lines = @(
  '# Menu Kopilot - production environment for myserver (/etc/menu-kopilot/env, chmod 600).'
  "# Written by scripts/new-prod-env.ps1 on $(Get-Date -Format 'yyyy-MM-dd'). Never commit this file."
  'NODE_ENV=production'
  'LOG_LEVEL=info'
  'TRUST_PROXY=true'
  'ROLE=all'
  'SEED_ON_START=true'
  ''
  '# DATABASE_URL and REDIS_URL are built by deploy/docker-compose.prod.yml from these.'
  'POSTGRES_USER=menu'
  "POSTGRES_PASSWORD=$(New-Hex 24)"
  'POSTGRES_DB=menu_kopilot'
  ''
  "JWT_SECRET=$(New-Hex 48)"
  "ADMIN_EMAIL=$AdminEmail"
  "ADMIN_PASSWORD=$plainPassword"
  "ADMIN_NAME=$AdminName"
  ''
  '# Server side only; the app never sees them. Empty = the app answers from the database and says so.'
  "GEMINI_API_KEY=$gemini"
  "GROQ_API_KEY=$groq"
  'LOCAL_ONLY_MODE=false'
  'DAILY_LLM_CALL_QUOTA=300'
  'DAILY_TOKEN_QUOTA=1500000'
  'QUOTA_TIMEZONE=Europe/Istanbul'
  ''
  '# nginx proxies menu.example.com to 127.0.0.1:<API_PORT>.'
  "API_PORT=$ApiPort"
)
[IO.File]::WriteAllText($target, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))

Write-Host "Wrote $target" -ForegroundColor Green
Write-Host "  POSTGRES_PASSWORD, JWT_SECRET  generated"
Write-Host "  ADMIN_EMAIL                    $AdminEmail"
Write-Host ("  GEMINI_API_KEY                 " + $(if ($gemini) { 'copied from .env' } else { 'empty (add later on the server)' }))
Write-Host ("  GROQ_API_KEY                   " + $(if ($groq) { 'copied from .env' } else { 'empty (add later on the server)' }))
Write-Host 'Next: copy it to the server (docs/DEPLOY_MYSERVER.md, section 2), then keep or delete the local copy.'
