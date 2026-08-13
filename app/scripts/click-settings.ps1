# 点击首页右上角设置按钮（顶栏最右 icon），随后截图
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32St {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, int extra);
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
[Win32St]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[Win32St]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600
$r = New-Object Win32St+RECT
[Win32St]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
# 设置按钮：顶栏最右 icon-btn；截图量得齿轮中心约 Right-90, Top+59
$x = $r.Right - 90; $y = $r.Top + 59
[Win32St]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 200
[Win32St]::mouse_event([Win32St]::LEFTDOWN, 0, 0, 0, 0); [Win32St]::mouse_event([Win32St]::LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 1500
Write-Output ("clicked settings at {0},{1}" -f $x, $y)
