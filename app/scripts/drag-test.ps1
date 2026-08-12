# 拖拽自动化验证：模拟鼠标在顶部拖拽条按下→移动→松开，比对窗口位置变化
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Drag {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, int extra);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004;
}
"@
$p = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Aurora Player' } |
  Select-Object -First 1
if (-not $p) { Write-Output "NO WINDOW"; exit 1 }
[Win32Drag]::ShowWindow($p.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
[Win32Drag]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600
$r = New-Object Win32Drag+RECT
[Win32Drag]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
if ($r.Left -lt -10000) { Write-Output "WINDOW MINIMIZED"; exit 1 }
Write-Output ("before: {0},{1}" -f $r.Left, $r.Top)

$sx = $r.Left + [int](($r.Right - $r.Left) / 2)
$sy = $r.Top + 6   # 拖拽条区域（顶部 14px 内）
[Win32Drag]::SetCursorPos($sx, $sy) | Out-Null
Start-Sleep -Milliseconds 200
[Win32Drag]::mouse_event([Win32Drag]::LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 150
for ($i = 1; $i -le 8; $i++) {
  [Win32Drag]::SetCursorPos($sx + $i * 25, $sy + $i * 15) | Out-Null
  Start-Sleep -Milliseconds 40
}
[Win32Drag]::mouse_event([Win32Drag]::LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 400

[Win32Drag]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
Write-Output ("after:  {0},{1}" -f $r.Left, $r.Top)
