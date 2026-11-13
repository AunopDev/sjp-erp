#requires -Version 5.1
<#
.SYNOPSIS
    Sync the curated OpenCode skill set used by SJP ERP from upstream GitHub repos.

.DESCRIPTION
    Vendors only the skills listed in .opencode/skills-manifest.json into
    .opencode/skills/<skill-id>/SKILL.md. Upstream repos are fetched at the
    exact commit pinned in the manifest, so re-running is reproducible.

    The full agentic-awesome-skills catalog is ~100 MB / ~3,000 skills; this
    project intentionally installs only the UI/UX + Angular subset that is
    relevant to the ERP frontend.

.PARAMETER Check
    Verify the installed tree matches the manifest without writing anything.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-opencode-skills.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sync-opencode-skills.ps1 -Check
#>
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$skillsRoot = Join-Path $repoRoot '.opencode\skills'
$manifestPath = Join-Path $repoRoot '.opencode\skills-manifest.json'
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'sjp-opencode-skills'

if (-not (Test-Path $manifestPath)) {
    throw "Manifest not found: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

function Invoke-Git {
    param([string[]]$GitArgs, [string]$WorkingDirectory)
    $output = & git -C $WorkingDirectory @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed in $WorkingDirectory`n$output"
    }
    return $output
}

function Get-SourceRepo {
    param([string]$Name, [string]$Url, [string]$Commit)

    $dir = Join-Path $workRoot $Name
    if (Test-Path (Join-Path $dir '.git')) {
        $current = & git -C $dir rev-parse --verify --quiet HEAD
        if ($LASTEXITCODE -eq 0 -and $current -and $current.Trim() -eq $Commit) {
            return $dir
        }
    }
    if (Test-Path $dir) {
        Remove-Item $dir -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Invoke-Git -WorkingDirectory $dir -GitArgs @('init', '--quiet') | Out-Null
    Invoke-Git -WorkingDirectory $dir -GitArgs @('remote', 'add', 'origin', $Url) | Out-Null
    Invoke-Git -WorkingDirectory $dir -GitArgs @('fetch', '--quiet', '--depth', '1', 'origin', $Commit) | Out-Null
    Invoke-Git -WorkingDirectory $dir -GitArgs @('checkout', '--quiet', 'FETCH_HEAD') | Out-Null
    return $dir
}

function Copy-Skill {
    param([string]$Source, [string]$Destination, [string[]]$Include = @())

    if (-not (Test-Path (Join-Path $Source 'SKILL.md'))) {
        throw "Not a skill directory (missing SKILL.md): $Source"
    }

    $parent = Split-Path $Destination -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    if ($Include.Count -gt 0) {
        foreach ($item in $Include) {
            $from = Join-Path $Source $item
            if (-not (Test-Path $from)) {
                throw "Skill include not found: $from"
            }
            Copy-Item $from (Join-Path $Destination $item) -Recurse -Force
        }
    } else {
        Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
    }
}

$installed = @()
$missing = @()

foreach ($repo in $manifest.repos) {
    $src = Get-SourceRepo -Name $repo.name -Url $repo.url -Commit $repo.commit
    $base = Join-Path $src $repo.skillsPath

    foreach ($skill in $repo.skills) {
        if ($skill -is [string]) {
            $id = $skill
            $sourceRel = $skill
            $include = @()
        } else {
            $id = $skill.id
            $sourceRel = if ($skill.source) { $skill.source } else { $skill.id }
            $include = if ($skill.include) { @($skill.include) } else { @() }
        }

        $source = Join-Path $base $sourceRel
        $destination = Join-Path $skillsRoot $id

        if ($Check) {
            if (-not (Test-Path (Join-Path $destination 'SKILL.md'))) {
                $missing += "$($repo.name)/$id"
            }
            continue
        }

        Copy-Skill -Source $source -Destination $destination -Include $include
        $installed += $id
    }

    # Keep upstream license text next to the vendored skills. Dot-folders are
    # skipped by OpenCode skill discovery.
    if (-not $Check) {
        $licenseDir = Join-Path $skillsRoot '.licenses' | Join-Path -ChildPath $repo.name
        New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
        foreach ($licenseName in @('LICENSE', 'LICENSE.txt', 'LICENSE-CONTENT')) {
            $licenseFile = Join-Path $src $licenseName
            if (Test-Path $licenseFile) {
                Copy-Item $licenseFile (Join-Path $licenseDir $licenseName) -Force
            }
        }
    }
}

if ($Check) {
    if ($missing.Count -gt 0) {
        Write-Host "Missing skills:" -ForegroundColor Red
        $missing | ForEach-Object { Write-Host "  - $_" }
        exit 1
    }
    Write-Host "All skills in the manifest are installed." -ForegroundColor Green
    exit 0
}

Write-Host ("Installed {0} skills into {1}" -f $installed.Count, $skillsRoot) -ForegroundColor Green
$installed | Sort-Object | ForEach-Object { Write-Host "  - $_" }
Write-Host "Restart is not required; OpenCode reloads project skills automatically." -ForegroundColor DarkGray
