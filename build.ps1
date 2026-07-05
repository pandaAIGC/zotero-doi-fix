param(
  [switch]$UpdateManifest
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = Join-Path $root "zotero-doi-fix.xpi"
$manifestPath = Join-Path $root "manifest.json"
$updatesPath = Join-Path $root "updates.json"

if (Test-Path -LiteralPath $output) {
  Remove-Item -LiteralPath $output
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
$zip = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Create)

try {
  $entries = @(
    "manifest.json",
    "bootstrap.js",
    "chrome",
    "icons",
    "locale"
  )

  foreach ($entry in $entries) {
    $path = Join-Path $root $entry

    if (Test-Path -LiteralPath $path -PathType Leaf) {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $path, $entry, $compressionLevel) | Out-Null
      continue
    }

    Get-ChildItem -LiteralPath $path -Recurse -File | ForEach-Object {
      $relative = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relative, $compressionLevel) | Out-Null
    }
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Built $output"

$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "SHA256 $hash"

if ($UpdateManifest) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $addonID = $manifest.applications.zotero.id
  $updateLink = "https://github.com/pandaAIGC/zotero-doi-fix/releases/download/v$($manifest.version)/zotero-doi-fix.xpi"
  $updateHash = "sha256:$hash"
  $minVersion = $manifest.applications.zotero.strict_min_version
  $maxVersion = $manifest.applications.zotero.strict_max_version
  $updatesJson = @"
{
  "addons": {
    "$addonID": {
      "updates": [
        {
          "version": "$($manifest.version)",
          "update_link": "$updateLink",
          "update_hash": "$updateHash",
          "applications": {
            "zotero": {
              "strict_min_version": "$minVersion",
              "strict_max_version": "$maxVersion"
            }
          }
        }
      ]
    }
  }
}
"@
  $utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($updatesPath, $updatesJson + [Environment]::NewLine, $utf8NoBOM)
  Write-Host "Updated $updatesPath"
}
