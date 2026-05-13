$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = Join-Path $root "zotero-doi-fix.xpi"

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
