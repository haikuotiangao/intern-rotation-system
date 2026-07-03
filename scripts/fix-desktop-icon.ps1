Write-Host "=== Fix Desktop Icon ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will:" -ForegroundColor White
Write-Host "  1. Delete old desktop shortcuts matching '*实习生*'" -ForegroundColor Gray
Write-Host "  2. Clear Windows icon cache (requires admin)" -ForegroundColor Gray
Write-Host "  3. Reinstall the new version with the correct icon" -ForegroundColor Gray
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host "Step 1: Deleting old desktop shortcuts..." -ForegroundColor Yellow
$shortcuts = Get-ChildItem "$env:USERPROFILE\Desktop\*.lnk" -ErrorAction SilentlyContinue
$deletedCount = 0
foreach ($s in $shortcuts) {
  if ($s.Name -like "*实习生*" -or $s.Name -like "*intern-rotation*") {
    try {
      Remove-Item $s.FullName -Force
      Write-Host "  Deleted: $($s.Name)" -ForegroundColor Yellow
      $deletedCount++
    } catch {
      Write-Host "  Failed: $($s.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}
if ($deletedCount -eq 0) { Write-Host "  No matching shortcuts found" -ForegroundColor Gray }

Write-Host ""
Write-Host "Step 2: Clearing Windows icon cache..." -ForegroundColor Yellow
try {
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  $cachePaths = @(
    "$env:LOCALAPPDATA\IconCache.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*.dat"
  )
  foreach ($p in $cachePaths) {
    $files = Get-Item $p -ErrorAction SilentlyContinue
    foreach ($f in $files) {
      try {
        Remove-Item $f.FullName -Force
        Write-Host "  Removed cache: $($f.Name)" -ForegroundColor Yellow
      } catch { }
    }
  }
  Start-Process explorer.exe
  Write-Host "  Icon cache cleared, Explorer restarted" -ForegroundColor Green
} catch {
  Write-Host "  Warning: $($_.Exception.Message)" -ForegroundColor Red
  Start-Process explorer.exe -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Step 3: Reinstalling the new version..." -ForegroundColor Yellow
$installerName = "实习生管理系统_1.0.0_x64-setup.exe"
$installer = $null
$candidates = @(
  (Join-Path $repoRoot "output\$installerName"),
  (Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\$installerName")
)
foreach ($c in $candidates) {
  if (Test-Path $c) { $installer = Get-Item $c; break }
}

if ($null -eq $installer) {
  Write-Host "  Installer not found. Looked in:" -ForegroundColor Red
  foreach ($c in $candidates) { Write-Host "    $c" -ForegroundColor Red }
} else {
  Write-Host "  Found installer: $($installer.FullName)" -ForegroundColor Gray
  Write-Host "  Starting installer (silent mode /S)..." -ForegroundColor Yellow
  try {
    $proc = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -PassThru -Wait -Verb RunAs
    Write-Host "  Install completed (exit $($proc.ExitCode))" -ForegroundColor Green
  } catch {
    Write-Host "  Silent install failed, launching GUI installer instead..." -ForegroundColor Yellow
    Start-Process $installer.FullName -Wait
    Write-Host "  Install completed" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Step 4: Refreshing desktop..." -ForegroundColor Yellow
try {
  $shell = New-Object -ComObject Shell.Application
  Start-Sleep -Seconds 2
  $shell.NameSpace(0).ParseName("").InvokeVerb("Refresh")
  Write-Host "  Desktop refreshed" -ForegroundColor Green
} catch {
  Write-Host "  Manual refresh may be needed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Write-Host "Your desktop icon should now show the new icon." -ForegroundColor White
Write-Host "If it still shows the old icon, right-click desktop -> View -> Refresh, or log out and back in." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
