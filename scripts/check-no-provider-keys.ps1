# Fails when anything that looks like an AI provider key or a direct provider endpoint appears in the mobile app.
# Provider keys must live ONLY on the backend (the APK can be decompiled).
# Usage (repo root):  powershell -File scripts/check-no-provider-keys.ps1
param(
  [string]$Root = (Join-Path $PSScriptRoot '..\mobile')
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
$excluded = '\\(build|\.dart_tool|\.gradle|Pods|\.symlinks|ephemeral)\\'

$files = Get-ChildItem -Path $Root -Recurse -File | Where-Object { $_.FullName -notmatch $excluded }
$hits = foreach ($pattern in $patterns) {
  $files | Select-String -Pattern $pattern -List | ForEach-Object { "$($_.Path):$($_.LineNumber): matches '$pattern'" }
}

if ($hits) {
  Write-Output 'Provider key or endpoint found in the mobile app:'
  $hits | ForEach-Object { Write-Output "  $_" }
  exit 1
}
Write-Output "OK: no provider keys or provider endpoints in $((Resolve-Path $Root).Path) ($($files.Count) files scanned)."
