# 黑屏诊断探针：把 "Aurora Player" 窗口置前 → 截图 → 输出中央区域平均亮度
param([string]$OutName = "shot.png")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 20; $i++) {
  $p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { $hwnd = $p.MainWindowHandle; break }
  Start-Sleep -Milliseconds 500
}
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "WINDOW NOT FOUND"; exit 1 }
[Win32]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
[Win32]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 800
$r = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$b = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $b.Size)
$out = Join-Path $PSScriptRoot $OutName
$b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
# 采样窗口中央 60%x50%(视频区)
$sum = 0; $n = 0
for ($x = [int]($w * 0.2); $x -lt [int]($w * 0.8); $x += 16) {
  for ($y = [int]($h * 0.2); $y -lt [int]($h * 0.7); $y += 16) {
    $p = $b.GetPixel($x, $y); $sum += ($p.R + $p.G + $p.B) / 3; $n++
  }
}
Write-Output ("window {0}x{1}, center-brightness: {2:N1}" -f $w, $h, ($sum / $n))
$g.Dispose(); $b.Dispose()
