# Creates the Android upload keystore for signed release APKs and writes mobile/android/key.properties.
# Run it yourself once (it asks for a password); neither file is ever committed (.gitignore).
#
#   powershell -File mobile/scripts/create-keystore.ps1
#
# KEEP A BACKUP of the .jks file and the password (password manager). Without them you cannot publish an update
# that installs over the existing app.
param(
  [string]$KeystorePath = (Join-Path (Join-Path $env:USERPROFILE '.android-keys') 'menu-kopilot-upload.jks'),
  [string]$Alias = 'upload',
  [int]$ValidityDays = 10000,
  [string]$DistinguishedName = 'CN=Menu Kopilot, O=bcsakalar, C=TR'
)

$ErrorActionPreference = 'Stop'

function Find-Keytool {
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += (Join-Path (Join-Path $env:JAVA_HOME 'bin') 'keytool.exe') }
  $candidates += 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  $command = Get-Command keytool -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw 'keytool not found. Install a JDK 17 (or Android Studio) and set JAVA_HOME.'
}

if (Test-Path $KeystorePath) {
  throw "Keystore already exists: $KeystorePath (delete or move it first if you really want a new one)."
}

$keytool = Find-Keytool
$secure = Read-Host -AsSecureString 'Keystore password (min. 6 characters)'
$confirm = Read-Host -AsSecureString 'Repeat the password'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$plainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm))
if ($plain -ne $plainConfirm) { throw 'Passwords do not match.' }
if ($plain.Length -lt 6) { throw 'Password must have at least 6 characters.' }

New-Item -ItemType Directory -Force -Path (Split-Path $KeystorePath) | Out-Null

# PKCS12 keystores use one password for the store and the key. It is passed through an environment variable so it
# does not show up in the process list.
$env:MK_KEYSTORE_PASSWORD = $plain
try {
  & $keytool -genkeypair -v -keystore $KeystorePath -storetype PKCS12 -keyalg RSA -keysize 4096 -validity $ValidityDays `
    -alias $Alias -dname $DistinguishedName -storepass:env MK_KEYSTORE_PASSWORD -keypass:env MK_KEYSTORE_PASSWORD
  if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item Env:\MK_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
}

$propertiesPath = Join-Path (Join-Path (Join-Path $PSScriptRoot '..') 'android') 'key.properties'
$storeFile = (Resolve-Path $KeystorePath).Path.Replace('\', '/')
$content = @(
  "storePassword=$plain",
  "keyPassword=$plain",
  "keyAlias=$Alias",
  "storeFile=$storeFile"
) -join "`n"
[System.IO.File]::WriteAllText($propertiesPath, "$content`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Output ''
Write-Output "Keystore:       $storeFile"
Write-Output "key.properties: $((Resolve-Path $propertiesPath).Path) (git-ignored)"
Write-Output ''
Write-Output 'Next:'
Write-Output '  1. Back up the keystore file and the password.'
Write-Output '  2. Build:  cd mobile; flutter build apk --release'
Write-Output '  3. For the GitHub release workflow add these repository secrets:'
Write-Output '       ANDROID_KEYSTORE_BASE64   (copy with the command below)'
Write-Output '       ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD (same password), ANDROID_KEY_ALIAS'
Write-Output "     [Convert]::ToBase64String([IO.File]::ReadAllBytes('$storeFile')) | Set-Clipboard"
