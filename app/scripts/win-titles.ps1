$ps = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $ps) { Write-Output "no electron window"; exit 0 }
$ps | ForEach-Object { Write-Output ("PID {0}: [{1}]" -f $_.Id, $_.MainWindowTitle) }
