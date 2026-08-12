# 缩略图气泡验证：鼠标移到进度条中央悬停 → 截图（应出现缩略图+时间气泡）
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Tb {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Aurora Player' } |
  Select-Object -First 1
if (-not $p) { Write-Output "NO WINDOW"; exit 1 }
[Win32Tb]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[Win32Tb]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600
$r = New-Object Win32Tb+RECT
[Win32Tb]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
# 进度条位置：控制层底部区域（bottom:24+，seekbar 约在窗口底上 ~95px），先晃动唤醒控制层
$cx = $r.Left + [int](($r.Right - $r.Left) * 0.6)
[Win32Tb]::SetCursorPos($cx, $r.Bottom - 200) | Out-Null
Start-Sleep -Milliseconds 700
[Win32Tb]::SetCursorPos($cx, $r.Bottom - 95) | Out-Null
Start-Sleep -Milliseconds 250
[Win32Tb]::SetCursorPos($cx + 4, $r.Bottom - 95) | Out-Null
Start-Sleep -Milliseconds 1200
Write-Output ("hover at {0},{1}" -f $cx, ($r.Bottom - 95))
