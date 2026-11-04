# Fails when anything that looks like an AI provider key or a direct provider endpoint appears in the site's source.
# Provider keys must live ONLY on the backend: everything under web/ ends up in a public bundle.
# Usage (repo root):  powershell -File scripts/check-no-provider-keys.ps1   (also runs under pwsh in CI)
param(
  # Built with Join-Path twice so the separator is right on Windows and on Linux (CI runs this under pwsh).
  [string]$Root = (Join-Path (Join-Path $PSScriptRoot '..') 'web')
)

$ErrorActionPreference = 'Stop'
$patterns = @(
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'AIza[0-9A-Za-z_\-]{20,}',
  'gsk_[0-9A-Za-z]{20,}',
  'generativelanguage\.googleapis\.com',
  'api\.groq\.com'
)
# Build outputs are skipped without descending into them (their paths can exceed the Windows path limit).
$excludedDirs = @('node_modules', 'dist')

function Get-SourceFiles([string]$Path) {
  foreach ($item in Get-ChildItem -LiteralPath $Path -Force) {
    if ($item.PSIsContainer) {
      if ($excludedDirs -notcontains $item.Name) { Get-SourceFiles $item.FullName }
    } else {
      $item
    }
  }
}

$files = @(Get-SourceFiles (Resolve-Path $Root).Path)
$hits = foreach ($pattern in $patterns) {
  $files | Select-String -Pattern $pattern -List | ForEach-Object { "$($_.Path):$($_.LineNumber): matches '$pattern'" }
}

if ($hits) {
  Write-Output 'Provider key or endpoint found in the web source:'
  $hits | ForEach-Object { Write-Output "  $_" }
  exit 1
}
Write-Output "OK: no provider keys or provider endpoints in $((Resolve-Path $Root).Path) ($($files.Count) files scanned)."
