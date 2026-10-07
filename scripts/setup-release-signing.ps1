<#
  Sets up release signing for the Bluvfi Android app on THIS machine.

  What it does
    1. Copies your release keystore to a folder outside every repository (default ~/.bluvfi).
    2. Asks for the key alias and passwords (typed masked; nothing is echoed or stored in the repo).
    3. Checks them against the keystore with keytool, so a typo is caught now and not after a long build.
    4. Writes BLUVFI_STORE_FILE / BLUVFI_STORE_PASSWORD / BLUVFI_KEY_ALIAS / BLUVFI_KEY_PASSWORD into your
       user-level ~/.gradle/gradle.properties (plugins/with-release-signing.js reads them; other lines are kept).

  Run it from the repo root in PowerShell:
      powershell -ExecutionPolicy Bypass -File scripts\setup-release-signing.ps1

  Use a different keystore:
      ... -File scripts\setup-release-signing.ps1 -Source "D:\keys\my-release.jks"
#>
param(
  # Where your release keystore is now. Default: the sibling "bluvfi" repo, where the existing app's key lives.
  [string]$Source = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'bluvfi\bluvfi-keystore.jks'),
  # Where the copy is kept (outside any repo).
  [string]$KeepIn = (Join-Path $HOME '.bluvfi')
)

$ErrorActionPreference = 'Stop'

function Plain([System.Security.SecureString]$s) {
  $p = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

if (-not (Test-Path $Source)) { throw "Keystore not found: $Source`nPass its location with -Source." }
$keytool = (Get-Command keytool -ErrorAction SilentlyContinue)
if (-not $keytool) { throw 'keytool was not found. Install JDK 17 and make sure its bin folder is on PATH.' }

New-Item -ItemType Directory -Force -Path $KeepIn | Out-Null
$dest = Join-Path $KeepIn (Split-Path $Source -Leaf)
if (-not (Test-Path $dest)) { Copy-Item $Source $dest; Write-Host "Copied the keystore to $dest" } else { Write-Host "Using the existing copy at $dest" }

$alias = Read-Host 'Key alias'
$storePw = Read-Host 'Keystore password' -AsSecureString
$keyPw = Read-Host 'Key password (press Enter if it is the same as the keystore password)' -AsSecureString
$storePlain = Plain $storePw
$keyPlain = if ($keyPw.Length -eq 0) { $storePlain } else { Plain $keyPw }

# Check both passwords and the alias with keytool, passing them through the environment (not on the command line).
$env:BLUVFI_CHECK_STORE_PW = $storePlain
$env:BLUVFI_CHECK_KEY_PW = $keyPlain
try {
  $out = & keytool -list -v -keystore $dest -alias $alias -storepass:env BLUVFI_CHECK_STORE_PW -keypass:env BLUVFI_CHECK_KEY_PW 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ($out | Out-String)
    throw 'keytool could not open the key with those details (wrong alias or password). Nothing was saved.'
  }
  $sha = ($out | Select-String 'SHA256:' | Select-Object -First 1).ToString().Trim()
  Write-Host "Key accepted. $sha"
} finally {
  Remove-Item Env:BLUVFI_CHECK_STORE_PW, Env:BLUVFI_CHECK_KEY_PW -ErrorAction SilentlyContinue
}

# Merge into ~/.gradle/gradle.properties: keep everything that is not ours, then add our four lines.
$gradleDir = Join-Path $HOME '.gradle'
New-Item -ItemType Directory -Force -Path $gradleDir | Out-Null
$props = Join-Path $gradleDir 'gradle.properties'
$kept = @()
if (Test-Path $props) { $kept = @(Get-Content $props | Where-Object { $_ -notmatch '^\s*BLUVFI_(STORE_FILE|STORE_PASSWORD|KEY_ALIAS|KEY_PASSWORD)\s*=' }) }
# .properties files treat backslash as an escape, so use forward slashes in the path and double any backslash in a value.
$esc = { param($v) $v.Replace('\', '\\') }
$lines = @(
  'BLUVFI_STORE_FILE=' + ($dest -replace '\\', '/'),
  'BLUVFI_STORE_PASSWORD=' + (& $esc $storePlain),
  'BLUVFI_KEY_ALIAS=' + (& $esc $alias),
  'BLUVFI_KEY_PASSWORD=' + (& $esc $keyPlain)
)
Set-Content -Path $props -Value ($kept + $lines) -Encoding ASCII
Write-Host "Saved to $props (user-level, outside the repo)."
Write-Host ''
Write-Host 'Next: build the signed release APK'
Write-Host '    cd android; .\gradlew assembleRelease'
Write-Host '    APK: android\app\build\outputs\apk\release\app-release.apk'
