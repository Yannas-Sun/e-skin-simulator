$ErrorActionPreference = "Stop"

$version = "46"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installRoot = Join-Path $projectRoot "tools\ngspice"
$archive = Join-Path $installRoot "ngspice-$version`_64.7z"
$downloadUrl = "https://sourceforge.net/projects/ngspice/files/ng-spice-rework/$version/ngspice-$version`_64.7z/download"
$executable = Join-Path $installRoot "Spice64\bin\ngspice_con.exe"

if (-not $installRoot.StartsWith($projectRoot)) {
    throw "Refusing to install outside the project workspace."
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

if (-not (Test-Path -LiteralPath $executable)) {
    Write-Host "Downloading ngspice-$version..."
    curl.exe -L --fail --retry 2 $downloadUrl -o $archive
    if ($LASTEXITCODE -ne 0) {
        throw "ngspice download failed."
    }

    Write-Host "Extracting ngspice into tools/ngspice..."
    tar -xf $archive -C $installRoot
    if ($LASTEXITCODE -ne 0) {
        throw "ngspice extraction failed."
    }
}

if (-not (Test-Path -LiteralPath $executable)) {
    throw "ngspice console executable was not found after installation."
}

if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
}

Write-Host "Installed:"
& $executable --version
