# 全屏进出验证：模拟 F 键两次，比对窗口尺寸是否进入并退出全屏
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Fs {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, int extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, int extra);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, KEYUP = 0x0002;
}
"@
Add-Type -AssemblyName System.Windows.Forms
$p = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Aurora Player' } |
  Select-Object -First 1
if (-not $p) { Write-Output "NO WINDOW"; exit 1 }
[Win32Fs]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[Win32Fs]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600

$r = New-Object Win32Fs+RECT
[Win32Fs]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$w0 = $r.Right - $r.Left; $h0 = $r.Bottom - $r.Top
Write-Output ("windowed: {0}x{1}" -f $w0, $h0)
$scr = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize
Write-Output ("screen: {0}x{1}" -f $scr.Width, $scr.Height)

# 点击窗口中央确保焦点（单击会暂停，无妨），按 F 进全屏
[Win32Fs]::SetCursorPos($r.Left + 400, $r.Top + 300) | Out-Null
[Win32Fs]::mouse_event([Win32Fs]::LEFTDOWN, 0, 0, 0, 0); [Win32Fs]::mouse_event([Win32Fs]::LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 300
[Win32Fs]::keybd_event(0x46, 0, 0, 0); [Win32Fs]::keybd_event(0x46, 0, [Win32Fs]::KEYUP, 0)  # F
Start-Sleep -Milliseconds 1200
[Win32Fs]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$w1 = $r.Right - $r.Left; $h1 = $r.Bottom - $r.Top
Write-Output ("after F#1: {0}x{1}" -f $w1, $h1)

[Win32Fs]::keybd_event(0x46, 0, 0, 0); [Win32Fs]::keybd_event(0x46, 0, [Win32Fs]::KEYUP, 0)  # F again
Start-Sleep -Milliseconds 1200
[Win32Fs]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$w2 = $r.Right - $r.Left; $h2 = $r.Bottom - $r.Top
Write-Output ("after F#2: {0}x{1}" -f $w2, $h2)

$entered = ($w1 -ge $scr.Width - 20) -and ($h1 -ge $scr.Height - 20)
$exited = ($w2 -lt $scr.Width - 100)
if ($entered -and $exited) { Write-Output "FULLSCREEN TOGGLE PASS" } else { Write-Output "FULLSCREEN TOGGLE FAIL"; exit 1 }
