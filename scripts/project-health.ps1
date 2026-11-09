param(
  [switch]$SkipAudit,
  [switch]$Quick
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDir = Join-Path $root 'checks\reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$reportPath = Join-Path $reportDir "health-$stamp.md"
$lines = New-Object System.Collections.Generic.List[string]

function Add-Line([string]$text = '') {
  $lines.Add($text) | Out-Null
  Write-Host $text
}

function Add-Section([string]$title) {
  Add-Line ''
  Add-Line "## $title"
  Add-Line ''
}

function Get-Tail([string[]]$output, [int]$count = 30) {
  if (-not $output) { return @() }
  return @($output | Select-Object -Last $count)
}

function Invoke-Check([string]$label, [string]$command) {
  Add-Line "- กำลังรัน: ``$command``"
  $output = & cmd /c $command 2>&1
  $code = $LASTEXITCODE
  Add-Line "  - ผลลัพธ์: $(if ($code -eq 0) { 'ผ่าน' } else { "ล้มเหลว (exit $code)" })"
  if ($code -ne 0) {
    Add-Line ''
    Add-Line '```text'
    foreach ($line in Get-Tail $output 40) { Add-Line ([string]$line) }
    Add-Line '```'
    Add-Line ''
  }
  return $code
}

Add-Line "# SJP ERP — Project Health Report"
Add-Line ''
Add-Line "- เวลา: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Line "- โฟลเดอร์: $root"
Add-Line "- โหมด: $(if ($Quick) { 'Quick' } else { 'Full' })$(if ($SkipAudit) { ' (ข้าม npm audit)' } else { '' })"
Add-Line ''
Add-Line '> รายงานนี้สร้างโดยสคริปต์อัตโนมัติ ยังไม่ใช่การแก้ไขโค้ด — ใช้ประกอบการตัดสินใจและให้ agent ตรวจต่อ'

$failures = New-Object System.Collections.Generic.List[string]

Add-Section '1) Build & Tests'
$buildCode = Invoke-Check 'Build ทั้งโปรเจ็ค' 'npm run build'
if ($buildCode -ne 0) { $failures.Add('npm run build ล้มเหลว') }

if (-not $Quick) {
  $testCode = Invoke-Check 'Tests ทั้งโปรเจ็ค' 'npm test'
  if ($testCode -ne 0) { $failures.Add('npm test ล้มเหลว') }
} else {
  Add-Line '- ข้าม tests เพราะใช้ -Quick'
}

Add-Section '2) Dependency Audit'
if ($SkipAudit) {
  Add-Line '- ข้ามตามคำสั่ง -SkipAudit'
} else {
  foreach ($dir in @('server', 'web')) {
    Add-Line "### $dir"
    Push-Location (Join-Path $root $dir)
    $raw = (& npm audit --json 2>$null | Out-String)
    Pop-Location
    if (-not $raw.Trim()) {
      Add-Line '- อ่านผล audit ไม่ได้ (อาจไม่มี network หรือ npm error)'
      continue
    }
    try {
      $json = $raw | ConvertFrom-Json
      $vulns = $json.metadata.vulnerabilities
      if ($vulns) {
        Add-Line ("- critical: {0} · high: {1} · moderate: {2} · low: {3}" -f $vulns.critical, $vulns.high, $vulns.moderate, $vulns.low)
        if (($vulns.critical + $vulns.high) -gt 0) {
          Add-Line '- **พบช่องโหว่ระดับ critical/high — ต้องตรวจก่อน deploy**'
          $failures.Add("$dir มี dependency vulnerability ระดับ critical/high")
        }
      } else {
        Add-Line '- ไม่พบข้อมูล vulnerability ในผล audit'
      }
    } catch {
      Add-Line '- parse ผล audit ไม่สำเร็จ'
    }
  }
}

Add-Section '3) Code Smells / Markers'
$sourceRoots = @((Join-Path $root 'server\src'), (Join-Path $root 'web\src'))
$files = @()
foreach ($sourceRoot in $sourceRoots) {
  if (Test-Path $sourceRoot) {
    $files += Get-ChildItem -Path $sourceRoot -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -in @('.ts', '.html', '.css', '.js') }
  }
}
Add-Line "- ไฟล์ที่สแกน: $($files.Count) ไฟล์"
Add-Line ''

$markers = @(
  @{ Name = 'TODO/FIXME/HACK'; Pattern = '\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b'; CaseSensitive = $true },
  @{ Name = 'console.log'; Pattern = 'console\.log\('; CaseSensitive = $false },
  @{ Name = 'debugger'; Pattern = '\bdebugger\b'; CaseSensitive = $true },
  @{ Name = 'TypeScript any'; Pattern = ':\s*any\b|as\s+any\b'; CaseSensitive = $false }
)

foreach ($marker in $markers) {
  $hits = @()
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Length).TrimStart('\')
    if ($marker.Name -eq 'console.log' -and $relative -eq 'server\src\main.ts') { continue }
    $found = Select-String -Path $file.FullName -Pattern $marker.Pattern -CaseSensitive:$marker.CaseSensitive -ErrorAction SilentlyContinue
    if ($found) {
      foreach ($hit in $found) {
        $hits += [pscustomobject]@{ File = $relative; Line = $hit.LineNumber; Text = $hit.Line.Trim() }
      }
    }
  }
  Add-Line "### $($marker.Name): $($hits.Count) จุด"
  foreach ($hit in @($hits | Select-Object -First 15)) {
    Add-Line "- ``$($hit.File):$($hit.Line)`` — $($hit.Text)"
  }
  if ($hits.Count -gt 15) { Add-Line "- ... และอีก $($hits.Count - 15) จุด" }
}

Add-Section '4) Runtime Data & Config Hygiene'
$dataDir = Join-Path $root 'server\data'
if (Test-Path $dataDir) {
  $dataFiles = @(Get-ChildItem -Path $dataDir -Recurse -File -ErrorAction SilentlyContinue)
  $dataSize = ($dataFiles | Measure-Object -Property Length -Sum).Sum
  if (-not $dataSize) { $dataSize = 0 }
  Add-Line ("- ``server/data`` มีอยู่: {0} ไฟล์ · {1:N2} MB" -f $dataFiles.Count, ($dataSize / 1MB))
  if ($dataFiles.Count -gt 0) {
    Add-Line '- **มีข้อมูล runtime ค้างอยู่** — ก่อนส่งมอบ/commit ควรล้างหรือสำรองตามต้องการ'
  }
} else {
  Add-Line '- ไม่มี `server/data` (สะอาด)'
}

$uploadsDir = Join-Path $root 'server\data\uploads'
if (Test-Path $uploadsDir) {
  $uploads = @(Get-ChildItem -Path $uploadsDir -File -ErrorAction SilentlyContinue)
  Add-Line "- ไฟล์แนบใน uploads: $($uploads.Count) ไฟล์"
}

$envPath = Join-Path $root 'server\.env'
if (Test-Path $envPath) {
  Add-Line '- พบ `server/.env` (ต้องไม่ commit ขึ้น repo)'
  $jwtLine = Select-String -Path $envPath -Pattern '^JWT_SECRET=' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($jwtLine -and $jwtLine.Line -match 'change-me') {
    Add-Line '- **JWT_SECRET ยังเป็นค่าเริ่มต้น — ต้องเปลี่ยนก่อนใช้งานจริง**'
    $failures.Add('JWT_SECRET ใช้ค่า default')
  }
} else {
  Add-Line '- ไม่พบ `server/.env` (ใช้ค่าจาก environment หรือค่าเริ่มต้น)'
}

Add-Section '5) Project Structure Sanity'
foreach ($expected in @('server\src\main.ts', 'web\src\main.ts', 'README.md', 'package.json')) {
  $path = Join-Path $root $expected
  Add-Line "- $(if (Test-Path $path) { 'OK' } else { 'MISSING' }) — ``$expected``"
  if (-not (Test-Path $path)) { $failures.Add("ไม่มีไฟล์ $expected") }
}

Add-Section '6) Summary'
if ($failures.Count -eq 0) {
  Add-Line '- ผลรวม: ไม่พบปัญหาระดับวิกฤตจากการตรวจอัตโนมัติ'
} else {
  Add-Line '- ผลรวม: พบประเด็นที่ควรตรวจต่อ:'
  foreach ($failure in $failures) { Add-Line "- $failure" }
}
Add-Line ''
Add-Line '> หมายเหตุ: สคริปต์นี้ตรวจ build/tests/dependency/markers/hygiene เท่านั้น ยังไม่ครอบคลุม logic bugs, permission bypass, UX regression หรือ security ทุกจุด — ควรให้ agent อ่านโค้ดและรายงานเพิ่ม'

Set-Content -Path $reportPath -Value ($lines -join "`r`n") -Encoding UTF8
Write-Host ''
Write-Host "Report: $reportPath"
if ($failures.Count -gt 0) { exit 1 } else { exit 0 }
