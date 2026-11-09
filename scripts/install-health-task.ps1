param(
  [string]$Time = '08:00',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'SJP ERP Health Check'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "ลบ scheduled task '$taskName' แล้ว"
  exit 0
}

$script = Join-Path $root 'scripts\project-health.ps1'
if (-not (Test-Path $script)) { throw "ไม่พบสคริปต์: $script" }

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -SkipAudit" `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$description = "ตรวจ build/tests/code markers/hygiene ของ SJP ERP และเขียนรายงานลง checks\reports"

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description $description -Force | Out-Null
Write-Host "สร้าง scheduled task '$taskName' เรียบร้อย — ทำงานทุกวันเวลา $Time"
Write-Host "รายงานจะอยู่ที่: $root\checks\reports"
Write-Host "ยกเลิกภายหลังด้วย: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-health-task.ps1 -Remove"
