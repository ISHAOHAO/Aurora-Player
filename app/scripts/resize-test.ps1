# 边缘缩放验证（带重试）：右边缘 +150px、下边缘 +100px，比对窗口 bounds
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Rsz {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, int extra);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
}
"@
$script:pw = $null
function Get-Win {
  $p = Get-Process electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Aurora Player' } |
    Select-Object -First 1
  return $p
}
function Get-Rect {
  $r = New-Object Win32Rsz+RECT
  [Win32Rsz]::GetWindowRect($script:pw.MainWindowHandle, [ref]$r) | Out-Null
  return $r
}
function Drag($x1, $y1, $x2, $y2) {
  [Win32Rsz]::SetCursorPos($x1, $y1) | Out-Null
  Start-Sleep -Milliseconds 350
  [Win32Rsz]::mouse_event([Win32Rsz]::LEFTDOWN, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 250
  for ($i = 1; $i -le 10; $i++) {
    [Win32Rsz]::SetCursorPos($x1 + [int](($x2 - $x1) * $i / 10), $y1 + [int](($y2 - $y1) * $i / 10)) | Out-Null
    Start-Sleep -Milliseconds 50
  }
  Start-Sleep -Milliseconds 150
  [Win32Rsz]::mouse_event([Win32Rsz]::LEFTUP, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 500
}

$script:pw = Get-Win
if (-not $script:pw) { Write-Output "NO WINDOW"; exit 1 }
[Win32Rsz]::ShowWindow($script:pw.MainWindowHandle, 9) | Out-Null
[Win32Rsz]::SetForegroundWindow($script:pw.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 800

$eastOK = $false; $southOK = $false
for ($try = 1; $try -le 3 -and -not ($eastOK -and $southOK); $try++) {
  $r = Get-Rect
  $w0 = $r.Right - $r.Left; $h0 = $r.Bottom - $r.Top
  if (-not $eastOK) {
    Drag ($r.Right - 5) ($r.Top + [int]($h0 / 2)) ($r.Right - 5 + 150) ($r.Top + [int]($h0 / 2))
    $r = Get-Rect
    $dw = ($r.Right - $r.Left) - $w0
    Write-Output ("try{0} east: delta {1}" -f $try, $dw)
    if ($dw -gt 100) { $eastOK = $true }
  }
  Start-Sleep -Milliseconds 400
  $r = Get-Rect
  $w0 = $r.Right - $r.Left; $h0 = $r.Bottom - $r.Top
  if (-not $southOK) {
    Drag ($r.Left + [int]($w0 / 2)) ($r.Bottom - 5) ($r.Left + [int]($w0 / 2)) ($r.Bottom - 5 + 100)
    $r = Get-Rect
    $dh = ($r.Bottom - $r.Top) - $h0
    Write-Output ("try{0} south: delta {1}" -f $try, $dh)
    if ($dh -gt 60) { $southOK = $true }
  }
  Start-Sleep -Milliseconds 400
}
if ($eastOK -and $southOK) { Write-Output "RESIZE PASS" } else { Write-Output "RESIZE FAIL"; exit 1 }
