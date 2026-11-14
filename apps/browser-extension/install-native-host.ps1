param(
    [Parameter(Mandatory = $true)]
    [string] $Executable,
    [string] $ExtensionId = 'dgejialhpalhoigbkmgeabgpphlipiek'
)

$ErrorActionPreference = 'Stop'
if ($ExtensionId -notmatch '^[a-p]{32}$') {
    throw "Invalid Chrome extension ID: $ExtensionId"
}
$helper = (Resolve-Path -LiteralPath $Executable).Path
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
    throw "Native helper not found: $helper"
}

if ($ExtensionId -ne 'dgejialhpalhoigbkmgeabgpphlipiek') {
    throw "The packaged extension ID is fixed; rebuild the manifest instead of overriding it"
}
& $helper --install-native-messaging
if ($LASTEXITCODE -ne 0) {
    throw "The native-messaging helper could not install its manifest (exit $LASTEXITCODE)"
}

$hostName = 'dev.codync.browser'
$manifestPath = Join-Path $env:LOCALAPPDATA 'Codync\BrowserExtension\dev.codync.browser.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.name -ne $hostName -or $manifest.path -ne $helper) {
    throw "The installed native-messaging manifest does not match the selected helper"
}

[pscustomobject]@{
    NativeHost = $hostName
    Executable = $helper
    Manifest = $manifestPath
    ExtensionId = $ExtensionId
    ChromeRegistry = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
    EdgeRegistry = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
}
