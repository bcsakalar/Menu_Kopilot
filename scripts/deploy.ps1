# Deploys (or updates) the production stack from Windows. The server runs a git clone of the repository
# (read-only deploy key) and pulls it; the API image is built on this PC - the server is too small for pnpm + tsc.
#
#   powershell -File scripts/deploy.ps1                          # push first; pull on the server, build + copy the image
#   powershell -File scripts/deploy.ps1 -SkipBuild -Tag 3f2a1bc  # roll back to an image already on the server
#   powershell -File scripts/deploy.ps1 -ImageSource ghcr -Tag 1.0.0   # pull a release image from GHCR instead
#   powershell -File scripts/deploy.ps1 -WithCaddy               # fresh droplet without nginx: Caddy on 80/443
#
# One-time server preparation (clone, secrets file, nginx site, DNS) is in docs/DEPLOY_MYSERVER.md.
param(
  [string]$SshHost = 'myserver',
  [ValidateSet('local', 'ghcr')][string]$ImageSource = 'local',
  [string]$Tag = '',
  [string]$RemoteDir = '/opt/menu-kopilot',
  [switch]$SkipBuild,
  [switch]$WithCaddy
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = '/etc/menu-kopilot/env'

function Invoke-Remote([string]$Command) {
  ssh $SshHost $Command
  if ($LASTEXITCODE -ne 0) { throw "remote command failed ($LASTEXITCODE): $Command" }
}

function Invoke-Local([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe failed ($LASTEXITCODE)" }
}

if ($ImageSource -eq 'local') {
  $image = 'menu-kopilot-api'
  if (-not $Tag) {
    if ($SkipBuild) { throw '-SkipBuild needs -Tag (an image tag that is already on the server)' }
    if (git -C $root status --porcelain -- backend deploy) { throw 'backend/ or deploy/ has uncommitted changes: commit and push first.' }
    $Tag = (git -C $root rev-parse --short HEAD).Trim()
  }
} else {
  $image = 'ghcr.io/bcsakalar/menu-kopilot-api'
  if (-not $Tag) { $Tag = 'latest' }
}
$profileArg = if ($WithCaddy) { ' --profile caddy' } else { '' }
$compose = "API_IMAGE=$image API_TAG=$Tag docker compose --env-file $envFile -f $RemoteDir/deploy/docker-compose.prod.yml$profileArg"

# The server runs exactly the commit that is on GitHub, and the image is built from that same commit.
Write-Output '==> Checking that this commit is on GitHub'
Invoke-Local 'git' @('-C', $root, 'fetch', '--quiet', 'origin')
$head = (git -C $root rev-parse HEAD).Trim()
$remoteHead = (git -C $root rev-parse origin/main).Trim()
if ($ImageSource -eq 'local' -and -not $SkipBuild -and $head -ne $remoteHead) {
  throw "Local HEAD ($head) is not origin/main ($remoteHead): commit and push first."
}

Write-Output "==> Checking the server ($SshHost)"
Invoke-Remote "test -f $envFile || { echo 'missing $envFile (see docs/DEPLOY_MYSERVER.md)'; exit 1; }"
Invoke-Remote "test -d $RemoteDir/.git || { echo 'no clone in $RemoteDir (see docs/DEPLOY_MYSERVER.md)'; exit 1; }"
# A secrets file written on Windows may carry CRLF, which would end up inside every value.
Invoke-Remote "sed -i 's/\r$//' $envFile && chmod 600 $envFile"
if ($WithCaddy) {
  Invoke-Remote "grep -q '^SITE_ADDRESS=..*' $envFile || { echo 'SITE_ADDRESS is required with -WithCaddy'; exit 1; }"
}

Write-Output '==> Pulling the repository on the server'
Invoke-Remote "git -C $RemoteDir checkout -q main && git -C $RemoteDir pull -q --ff-only"
$serverHead = (ssh $SshHost "git -C $RemoteDir rev-parse HEAD").Trim()
Write-Output "    server is at $($serverHead.Substring(0, 7))"

if ($ImageSource -eq 'ghcr') {
  Write-Output "==> Pulling $image`:$Tag"
  Invoke-Remote "cd $RemoteDir && $compose pull api"
} elseif (-not $SkipBuild) {
  # Built here (the server has too little memory for pnpm install + tsc) for the server's architecture.
  Write-Output "==> Building $image`:$Tag on this PC"
  Invoke-Local 'docker' @('build', '--platform', 'linux/amd64', '-t', "${image}:$Tag", (Join-Path $root 'backend'))

  $work = Join-Path $env:TEMP 'menu-kopilot-image'
  New-Item -ItemType Directory -Force $work | Out-Null
  $tar = Join-Path $work 'menu-kopilot-api.tar'
  $archive = Join-Path $work 'menu-kopilot-api.tar.gz'
  Write-Output '==> Saving and compressing the image'
  Invoke-Local 'docker' @('save', '-o', $tar, "${image}:$Tag")
  # Windows' own bsdtar (not a PowerShell pipe, which would corrupt binary data).
  Invoke-Local "$env:SystemRoot\System32\tar.exe" @('-czf', $archive, '-C', $work, 'menu-kopilot-api.tar')
  Remove-Item $tar
  $sizeMb = [Math]::Round((Get-Item $archive).Length / 1MB, 1)

  Write-Output "==> Copying the image to the server ($sizeMb MB)"
  scp -q $archive "${SshHost}:/tmp/menu-kopilot-api.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw 'scp failed for the image' }
  Remove-Item $archive
  Invoke-Remote 'tar -xzOf /tmp/menu-kopilot-api.tar.gz menu-kopilot-api.tar | docker load && rm -f /tmp/menu-kopilot-api.tar.gz'
} else {
  Invoke-Remote "docker image inspect ${image}:$Tag > /dev/null || { echo 'image ${image}:$Tag is not on the server'; exit 1; }"
}

Write-Output '==> Starting the stack (migrations + seed run when the API starts)'
Invoke-Remote "cd $RemoteDir && $compose up -d --remove-orphans"

Write-Output '==> Waiting for /health/ready'
$ready = $false
# "Connection refused" on stderr is expected while migrations and the seed run; Windows PowerShell 5.1 would turn it
# into a terminating error under 'Stop'.
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  for ($i = 0; $i -lt 40 -and -not $ready; $i++) {
    Start-Sleep -Seconds 3
    ssh $SshHost "cd $RemoteDir && $compose exec -T api wget -qO- http://127.0.0.1:3000/health/ready" *> $null
    $ready = $LASTEXITCODE -eq 0
  }
} finally {
  $ErrorActionPreference = $previous
}
Invoke-Remote "cd $RemoteDir && $compose ps"
if (-not $ready) {
  throw "API did not become ready; check: ssh $SshHost `"docker logs --tail 100 menu-kopilot-api-1`""
}
Write-Output "==> Ready: $image`:$Tag"
Write-Output "    Previous images stay for rollbacks: ssh $SshHost `"docker image ls $image`""
