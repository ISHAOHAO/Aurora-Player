# 滚动到媒体库区域并截图
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Sc {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, int extra);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint WHEEL = 0x0800;
}
"@
$p = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Aurora Player' } |
  Select-Object -First 1
if (-not $p) { Write-Output "NO WINDOW"; exit 1 }
[Win32Sc]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[Win32Sc]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object Win32Sc+RECT
[Win32Sc]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[Win32Sc]::SetCursorPos($r.Left + 600, $r.Top + 400) | Out-Null
Start-Sleep -Milliseconds 300
for ($i = 0; $i -lt 8; $i++) {
  [Win32Sc]::mouse_event([Win32Sc]::WHEEL, 0, 0, -240, 0)
  Start-Sleep -Milliseconds 120
}
Start-Sleep -Milliseconds 800
Write-Output "scrolled"
